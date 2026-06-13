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
