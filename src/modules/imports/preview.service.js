import * as repository from './import.repository.js';
import { parseCSV } from './utils/csvParser.js';
import { cleanRow } from './utils/cleaner.js';
import { getAdvisorSuggestions } from './ai/mappingAdvisor.js';
import { getConflictsForRows } from './conflict.service.js';
import { buildPreview } from './utils/previewBuilder.js';
import { ValidationError } from '../../utils/errors.js';

/**
 * Parses single export CSV and builds AI-assisted import previews.
 */
export async function generateImportPreview(workspaceId, userId, file) {
  if (!file || !file.buffer) {
    throw new ValidationError('No file uploaded or file is empty.');
  }

  // Create temporary job in PENDING status
  const job = await repository.createJob({
    workspaceId,
    uploadedBy: userId,
    type: 'SALES_EXPORT',
    fileName: file.originalname
  });

  try {
    const csvText = file.buffer.toString('utf8');
    const rawRows = parseCSV(csvText);
    const totalRows = rawRows.length;

    if (totalRows === 0) {
      throw new ValidationError('CSV file is empty or has no header.');
    }

    const headers = Object.keys(rawRows[0]);
    const aiAdvisor = getAdvisorSuggestions(headers);

    // Run clean step on all raw rows based on AI suggested mappings
    const cleanedRows = rawRows.map(row => cleanRow(row, aiAdvisor.mappings));

    const validRowsCount = cleanedRows.filter(r => r.isValid).length;
    const invalidRowsCount = totalRows - validRowsCount;

    // Potential counts
    const potentialCustomersCount = cleanedRows.filter(r => r.isValid && (r.data.firstName || r.data.email || r.data.phone)).length;
    const potentialOrdersCount = cleanedRows.filter(r => r.isValid && r.data.externalOrderId).length;

    // Detect conflicts (potential duplicates)
    const conflicts = await getConflictsForRows(workspaceId, cleanedRows);
    const potentialDuplicatesCount = conflicts.customers.length + conflicts.orders.length;

    // Sample cleaned records for preview display (up to 10 rows)
    const sampleTransformedRecords = cleanedRows.slice(0, 10).map(r => ({
      isValid: r.isValid,
      errors: r.errors,
      data: r.data
    }));

    const preview = buildPreview({
      importJobId: job.id,
      totalRows,
      validRowsCount,
      invalidRowsCount,
      potentialCustomersCount,
      potentialOrdersCount,
      potentialDuplicatesCount,
      suggestedMappings: aiAdvisor.mappings,
      suggestedStrategy: aiAdvisor.suggestedStrategy,
      strategyExplanation: aiAdvisor.strategyExplanation,
      sampleTransformedRecords,
      conflicts
    });

    // Save state details back to ImportJob database
    await repository.updateJob(job.id, {
      status: 'PREVIEW_READY',
      totalRows,
      previewData: {
        rawRows, // Persist raw parsed rows so we don't require file re-upload on confirm
        sampleTransformedRecords
      },
      detectedMappings: aiAdvisor.mappings,
      conflictSummary: conflicts
    });

    return preview;
  } catch (err) {
    await repository.updateJob(job.id, {
      status: 'FAILED',
      errorMessage: err.message,
      completedAt: new Date()
    });
    throw err;
  }
}
