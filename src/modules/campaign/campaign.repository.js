import prisma from '../../config/database.js';

/**
 * Creates a new campaign record in PostgreSQL.
 */
export async function createCampaign(data) {
  return prisma.campaign.create({
    data: {
      workspaceId: data.workspaceId,
      segmentId: data.segmentId,
      name: data.name,
      channel: data.channel,
      messageSubject: data.messageSubject,
      messageBody: data.messageBody,
      status: data.status,
      sentCount: data.sentCount,
      openRate: data.openRate,
      clickRate: data.clickRate,
      conversionRate: data.conversionRate
    },
    include: {
      segment: true
    }
  });
}

/**
 * Lists all campaigns triggered in a specific workspace.
 */
export async function listCampaigns(workspaceId) {
  return prisma.campaign.findMany({
    where: { workspaceId },
    include: {
      segment: true
    },
    orderBy: {
      createdAt: 'desc'
    }
  });
}

/**
 * Fetch a specific campaign's metadata.
 */
export async function findById(workspaceId, id) {
  return prisma.campaign.findFirst({
    where: {
      id,
      workspaceId
    },
    include: {
      segment: true
    }
  });
}
