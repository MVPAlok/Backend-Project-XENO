import { parseIntent } from '../../brain/intent-parser/index.js';
import { generateSummary } from '../../brain/summary-generator/index.js';
import { compileRulesToSql } from '../../shared/query-builder/queryBuilder.js';
import * as repository from './audience.repository.js';
import { llmOutputSchema } from './audience.validation.js';
import prisma from '../../config/database.js';
import { ValidationError, NotFoundError } from '../../utils/errors.js';
import logger from '../../utils/logger.js';

const PREVIEW_LIMIT = process.env.PREVIEW_LIMIT ? parseInt(process.env.PREVIEW_LIMIT, 10) : 50;

/**
 * Parses conversational prompt, compiles rules, runs query, and generates aggregate AI summaries.
 */
export async function generateAudience(workspaceId, prompt, now = new Date()) {
  let llmRawOutput;
  try {
    llmRawOutput = await parseIntent(prompt);
  } catch (err) {
    logger.error({ prompt, error: err.message }, 'AI Intent Parser Failure');
    throw new ValidationError(`AI parsing failed: ${err.message}`);
  }

  // Verify and validate JSON structure
  let parsedJson;
  try {
    parsedJson = JSON.parse(llmRawOutput);
  } catch (err) {
    logger.error({ prompt, rawOutput: llmRawOutput }, 'AI Output Invalid JSON');
    throw new ValidationError('AI response is not valid JSON.');
  }

  // Zod validation
  const validation = llmOutputSchema.safeParse(parsedJson);
  if (!validation.success) {
    logger.error({ prompt, errors: validation.error.format() }, 'AI Output Validation Failure');
    throw new ValidationError('AI response validation failed.');
  }

  const { segmentName, rules } = validation.data;

  // Execute query safely
  const { sql, params } = compileRulesToSql(workspaceId, rules, now);
  let results = [];
  try {
    results = await prisma.$queryRawUnsafe(sql, ...params);
  } catch (err) {
    logger.error({ sql, params, error: err.message }, 'Segment Database Query Execution Error');
    throw new ValidationError('Error compiling or executing segment query.');
  }

  // Calculate aggregates
  const aggregates = calculateAggregates(results, now);

  // Generate summary
  let aiSummary;
  try {
    aiSummary = await generateSummary(segmentName, aggregates);
  } catch (err) {
    aiSummary = `I found ${aggregates.count} customers matching "${segmentName}".`;
  }

  // Limit previews
  const previewCustomers = results.slice(0, PREVIEW_LIMIT).map(row => ({
    customerId: row.id,
    name: row.name,
    city: row.city,
    totalSpend: Number(row.totalSpend),
    orderCount: Number(row.orderCount),
    lastPurchaseDate: row.lastPurchaseDate
  }));

  return {
    segmentName,
    rules,
    count: aggregates.count,
    previewCustomers,
    aiSummary
  };
}

/**
 * Persists segment to the database.
 */
export async function saveSegment(workspaceId, userId, name, description, rules) {
  const segment = await repository.saveSegment(workspaceId, userId, name, description, rules);
  return formatSegment(segment);
}

/**
 * Lists segments for workspace.
 */
export async function listSegments(workspaceId) {
  const segments = await repository.listSegments(workspaceId);
  return segments.map(formatSegment);
}

/**
 * Retrieves details for a segment.
 */
export async function getSegmentDetails(workspaceId, segmentId) {
  const segment = await repository.findSegmentById(workspaceId, segmentId);
  if (!segment) {
    throw new NotFoundError('Segment not found.');
  }
  return formatSegment(segment);
}

/**
 * Previews target customers for a saved segment.
 */
export async function getSegmentPreview(workspaceId, segmentId, now = new Date()) {
  const segment = await repository.findSegmentById(workspaceId, segmentId);
  if (!segment) {
    throw new NotFoundError('Segment not found.');
  }

  const deserializedRules = segment.rules.map(r => ({
    field: r.field,
    operator: r.operator,
    value: JSON.parse(r.value)
  }));

  const { sql, params } = compileRulesToSql(workspaceId, deserializedRules, now);
  const results = await prisma.$queryRawUnsafe(sql, ...params);

  const sampleCustomers = results.slice(0, PREVIEW_LIMIT).map(row => ({
    customerId: row.id,
    name: row.name,
    city: row.city,
    totalSpend: Number(row.totalSpend),
    orderCount: Number(row.orderCount),
    lastPurchaseDate: row.lastPurchaseDate
  }));

  return {
    count: results.length,
    sampleCustomers
  };
}

/**
 * Formats database segment object to API response contract.
 */
function formatSegment(segment) {
  return {
    id: segment.id,
    workspaceId: segment.workspaceId,
    name: segment.name,
    description: segment.description,
    createdBy: segment.createdBy,
    createdAt: segment.createdAt,
    updatedAt: segment.updatedAt,
    rules: segment.rules.map(r => ({
      id: r.id,
      field: r.field,
      operator: r.operator,
      value: JSON.parse(r.value)
    }))
  };
}

/**
 * Helper to calculate aggregates from raw query results.
 */
function calculateAggregates(results, now = new Date()) {
  const count = results.length;
  if (count === 0) {
    return {
      count: 0,
      averageSpend: 0,
      averageRecencyDays: 0,
      topCities: []
    };
  }

  let totalSpendSum = 0;
  let recencySum = 0;
  const cityCounts = {};

  for (const r of results) {
    totalSpendSum += Number(r.totalSpend || 0);
    if (r.city) {
      cityCounts[r.city] = (cityCounts[r.city] || 0) + 1;
    }
    if (r.lastPurchaseDate) {
      const recencyDays = Math.max(0, Math.floor((now.getTime() - new Date(r.lastPurchaseDate).getTime()) / 86400000));
      recencySum += recencyDays;
    }
  }

  const topCities = Object.entries(cityCounts)
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  return {
    count,
    averageSpend: Math.round(totalSpendSum / count),
    averageRecencyDays: Math.round(recencySum / count),
    topCities
  };
}
