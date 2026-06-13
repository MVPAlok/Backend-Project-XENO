import prisma from '../../config/database.js';

/**
 * Finds all customers in a workspace.
 */
export async function findByWorkspace(workspaceId) {
  return prisma.customer.findMany({
    where: {
      workspaceId,
      deletedAt: null
    }
  });
}

/**
 * Executes a transaction to batch insert and update customers.
 * @param {Array<Object>} newCustomers - List of customer objects to create
 * @param {Array<Object>} updates - List of { id, data } objects to update
 */
export async function bulkWriteCustomers(newCustomers, updates) {
  return prisma.$transaction(async (tx) => {
    // 1. Create new customers
    if (newCustomers.length > 0) {
      await tx.customer.createMany({
        data: newCustomers
      });
    }

    // 2. Perform updates
    for (const update of updates) {
      await tx.customer.update({
        where: { id: update.id },
        data: update.data
      });
    }
  });
}

/**
 * Find customer by email or phone in a workspace.
 */
export async function findCustomerByIdentifier(workspaceId, email, phone) {
  if (!email && !phone) return null;

  return prisma.customer.findFirst({
    where: {
      workspaceId,
      deletedAt: null,
      OR: [
        ...(email ? [{ email }] : []),
        ...(phone ? [{ phone }] : [])
      ]
    }
  });
}
