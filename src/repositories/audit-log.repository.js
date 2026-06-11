import prisma from '../config/database.js';

/**
 * Persist an audit log entry.
 * @param {object} logData 
 * @param {string} [logData.userId]
 * @param {string} logData.action
 * @param {string} [logData.ipAddress]
 * @param {string} [logData.userAgent]
 * @param {object} [logData.details]
 * @returns {Promise<import('@prisma/client').AuditLog>}
 */
export async function createAuditLog({ userId, action, ipAddress, userAgent, details }) {
  return prisma.auditLog.create({
    data: {
      userId,
      action,
      ipAddress,
      userAgent,
      details: details ? JSON.parse(JSON.stringify(details)) : undefined
    }
  });
}

export default {
  createAuditLog
};
