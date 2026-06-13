import prisma from '../../config/database.js';

/**
 * Saves a generated audience as a reusable segment.
 */
export async function saveSegment(workspaceId, createdBy, name, description, rules) {
  return prisma.$transaction(async (tx) => {
    const segment = await tx.segment.create({
      data: {
        workspaceId,
        createdBy,
        name,
        description
      }
    });

    const ruleData = rules.map(rule => ({
      segmentId: segment.id,
      field: rule.field,
      operator: rule.operator,
      value: JSON.stringify(rule.value)
    }));

    await tx.segmentRule.createMany({
      data: ruleData
    });

    return tx.segment.findUnique({
      where: { id: segment.id },
      include: { rules: true }
    });
  });
}

/**
 * Lists all saved segments for a workspace.
 */
export async function listSegments(workspaceId) {
  return prisma.segment.findMany({
    where: { workspaceId },
    orderBy: { createdAt: 'desc' },
    include: { rules: true }
  });
}

/**
 * Finds a specific segment by ID.
 */
export async function findSegmentById(workspaceId, segmentId) {
  return prisma.segment.findFirst({
    where: {
      id: segmentId,
      workspaceId
    },
    include: { rules: true }
  });
}
