import * as repository from './campaign.repository.js';
import { getSegmentPreview } from '../audience/audience.service.js';
import { NotFoundError } from '../../utils/errors.js';
import prisma from '../../config/database.js';
import { sendCampaign } from '../../services/sender.service.js';

/**
 * Creates and persists a campaign. If SENT, calculates metrics.
 */
export async function createCampaign(workspaceId, data) {
  // Validate segment exists and belongs to workspace
  const segment = await prisma.segment.findFirst({
    where: {
      id: data.segmentId,
      workspaceId
    }
  });

  if (!segment) {
    throw new NotFoundError('Target segment not found in this workspace.');
  }

  const campaign = await repository.createCampaign({
    workspaceId,
    segmentId: data.segmentId,
    name: data.name,
    channel: data.channel,
    messageSubject: data.messageSubject,
    messageBody: data.messageBody,
    status: data.status,
    sentCount: null,
    openRate: null,
    clickRate: null,
    conversionRate: null
  });

  let deliveries = [];
  if (data.status === 'SENT') {
    try {
      deliveries = await sendCampaign(workspaceId, campaign.id);
    } catch (err) {
      console.error('Simulated dispatch failed:', err);
    }
  }

  const updatedCampaign = await prisma.campaign.findUnique({
    where: { id: campaign.id },
    include: { segment: true }
  });

  return {
    ...formatCampaign(updatedCampaign),
    deliveries
  };
}

/**
 * Lists all campaigns under workspace context.
 */
export async function listCampaigns(workspaceId) {
  const campaigns = await repository.listCampaigns(workspaceId);
  return campaigns.map(formatCampaign);
}

/**
 * Formats decimal database types back to numeric floats.
 */
function formatCampaign(c) {
  return {
    id: c.id,
    workspaceId: c.workspaceId,
    segmentId: c.segmentId,
    segmentName: c.segment?.name || 'Saved Segment',
    name: c.name,
    channel: c.channel,
    messageSubject: c.messageSubject,
    messageBody: c.messageBody,
    status: c.status,
    sentCount: c.sentCount,
    openRate: c.openRate ? Number(c.openRate) : undefined,
    clickRate: c.clickRate ? Number(c.clickRate) : undefined,
    conversionRate: c.conversionRate ? Number(c.conversionRate) : undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
}
