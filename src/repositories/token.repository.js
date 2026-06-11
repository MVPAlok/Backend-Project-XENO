import prisma from '../config/database.js';

/* Email Verification Token Operations */

/**
 * Persist an email verification token.
 * @param {string} userId 
 * @param {string} tokenHash 
 * @param {Date} expiry 
 * @returns {Promise<import('@prisma/client').EmailVerificationToken>}
 */
export async function createEmailVerificationToken(userId, tokenHash, expiry) {
  return prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash,
      expiry
    }
  });
}

/**
 * Retrieve verification token by its hash.
 * @param {string} tokenHash 
 * @returns {Promise<import('@prisma/client').EmailVerificationToken|null>}
 */
export async function findEmailVerificationToken(tokenHash) {
  return prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
}

/**
 * Mark a verification token as consumed.
 * @param {string} id 
 * @returns {Promise<import('@prisma/client').EmailVerificationToken>}
 */
export async function consumeEmailVerificationToken(id) {
  return prisma.emailVerificationToken.update({
    where: { id },
    data: { consumedAt: new Date() }
  });
}

/* Password Reset Token Operations */

/**
 * Persist a password reset token.
 * @param {string} userId 
 * @param {string} tokenHash 
 * @param {Date} expiry 
 * @returns {Promise<import('@prisma/client').PasswordResetToken>}
 */
export async function createPasswordResetToken(userId, tokenHash, expiry) {
  return prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash,
      expiry
    }
  });
}

/**
 * Retrieve password reset token by its hash.
 * @param {string} tokenHash 
 * @returns {Promise<import('@prisma/client').PasswordResetToken|null>}
 */
export async function findPasswordResetToken(tokenHash) {
  return prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });
}

/**
 * Mark password reset token as consumed.
 * @param {string} id 
 * @returns {Promise<import('@prisma/client').PasswordResetToken>}
 */
export async function consumePasswordResetToken(id) {
  return prisma.passwordResetToken.update({
    where: { id },
    data: { consumedAt: new Date() }
  });
}

export default {
  createEmailVerificationToken,
  findEmailVerificationToken,
  consumeEmailVerificationToken,
  createPasswordResetToken,
  findPasswordResetToken,
  consumePasswordResetToken
};
