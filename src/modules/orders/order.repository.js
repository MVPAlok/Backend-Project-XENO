import prisma from '../../config/database.js';

/**
 * Finds existing orders in a workspace matching a list of external order IDs.
 */
export async function findByExternalIds(workspaceId, externalOrderIds) {
  if (externalOrderIds.length === 0) return [];

  return prisma.order.findMany({
    where: {
      workspaceId,
      externalOrderId: {
        in: externalOrderIds.filter(Boolean)
      }
    }
  });
}

/**
 * Bulk insert orders in a transaction.
 */
export async function bulkCreateOrders(orders) {
  if (orders.length === 0) return;

  return prisma.order.createMany({
    data: orders
  });
}

/**
 * Executes a transaction to batch insert and update orders.
 */
export async function bulkWriteOrders(newOrders, updates) {
  return prisma.$transaction(async (tx) => {
    if (newOrders.length > 0) {
      await tx.order.createMany({
        data: newOrders
      });
    }
    for (const update of updates) {
      await tx.order.update({
        where: { id: update.id },
        data: update.data
      });
    }
  });
}

