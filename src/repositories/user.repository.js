import prisma from '../config/database.js';

/**
 * Find user by email (case-insensitive and not soft-deleted).
 * @param {string} email 
 * @returns {Promise<import('@prisma/client').User|null>}
 */
export async function findByEmail(email) {
  return prisma.user.findFirst({
    where: {
      email: email.toLowerCase(),
      deletedAt: null
    }
  });
}

/**
 * Find user by ID (not soft-deleted).
 * @param {string} id 
 * @returns {Promise<import('@prisma/client').User|null>}
 */
export async function findById(id) {
  return prisma.user.findFirst({
    where: {
      id,
      deletedAt: null
    }
  });
}

/**
 * Create a new user.
 * @param {object} userData 
 * @returns {Promise<import('@prisma/client').User>}
 */
export async function create(userData) {
  return prisma.user.create({
    data: {
      ...userData,
      email: userData.email.toLowerCase()
    }
  });
}

/**
 * Update user data.
 * @param {string} id 
 * @param {object} updateData 
 * @returns {Promise<import('@prisma/client').User>}
 */
export async function update(id, updateData) {
  return prisma.user.update({
    where: { id },
    data: updateData
  });
}

/**
 * Soft delete a user by setting the deletedAt timestamp.
 * @param {string} id 
 * @returns {Promise<import('@prisma/client').User>}
 */
export async function softDelete(id) {
  return prisma.user.update({
    where: { id },
    data: {
      deletedAt: new Date(),
      status: 'DELETED'
    }
  });
}

export default {
  findByEmail,
  findById,
  create,
  update,
  softDelete
};
