import prisma from '../config/database.js';

/**
 * Persist a new user session.
 * @param {object} sessionData 
 * @returns {Promise<import('@prisma/client').Session>}
 */
export async function createSession(sessionData) {
  return prisma.session.create({
    data: sessionData
  });
}

/**
 * Retrieve session by its unique ID.
 * @param {string} id 
 * @returns {Promise<import('@prisma/client').Session|null>}
 */
export async function findSessionById(id) {
  return prisma.session.findUnique({
    where: { id },
    include: { user: true }
  });
}

/**
 * Find session by the hash of its refresh token.
 * @param {string} refreshTokenHash 
 * @returns {Promise<import('@prisma/client').Session|null>}
 */
export async function findSessionByTokenHash(refreshTokenHash) {
  return prisma.session.findUnique({
    where: { refreshTokenHash },
    include: { user: true }
  });
}

/**
 * Revoke a specific session.
 * @param {string} id 
 * @returns {Promise<import('@prisma/client').Session>}
 */
export async function revokeSession(id) {
  return prisma.session.update({
    where: { id },
    data: { revokedTimestamp: new Date() }
  });
}

/**
 * Revoke all active sessions for a user (useful for password resets, compromise recovery).
 * @param {string} userId 
 * @returns {Promise<import('@prisma/client').Prisma.BatchPayload>}
 */
export async function revokeAllUserSessions(userId) {
  return prisma.session.updateMany({
    where: {
      userId,
      revokedTimestamp: null,
      expirationTimestamp: { gt: new Date() }
    },
    data: { revokedTimestamp: new Date() }
  });
}

export default {
  createSession,
  findSessionById,
  findSessionByTokenHash,
  revokeSession,
  revokeAllUserSessions
};
