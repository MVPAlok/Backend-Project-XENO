import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../config/env.js';
import prisma from '../config/database.js';
import { 
  hashPassword, 
  comparePassword, 
  generateRandomToken, 
  hashToken, 
  timingSafeCompare 
} from '../utils/crypto.js';
import { 
  AuthenticationError, 
  ConflictError, 
  ValidationError 
} from '../utils/errors.js';
import { sendVerificationEmail, sendPasswordResetEmail } from './email.service.js';
import logger from '../utils/logger.js';

// Expiry Constants
const ACCESS_TOKEN_EXPIRY = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days
const VERIFICATION_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_EXPIRY = 1 * 60 * 60 * 1000; // 1 hour

/**
 * Generate a JWT access token.
 */
function generateAccessToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role,
      sessionId
    },
    env.JWT_ACCESS_SECRET,
    {
      expiresIn: '15m',
      issuer: 'xeno-auth-issuer',
      audience: 'xeno-saas-audience',
      algorithm: 'HS256'
    }
  );
}

/**
 * Generate a JWT refresh token.
 */
function generateRefreshToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user.id,
      sessionId
    },
    env.JWT_REFRESH_SECRET,
    {
      expiresIn: '7d',
      issuer: 'xeno-auth-issuer',
      audience: 'xeno-saas-audience',
      algorithm: 'HS256'
    }
  );
}

/**
 * Sign up a new user.
 */
export async function signUp(userData, origin) {
  const normalizedEmail = userData.email.toLowerCase();

  // Prevent duplicate registrations
  const existingUser = await prisma.user.findFirst({
    where: { email: normalizedEmail, deletedAt: null }
  });

  if (existingUser) {
    logger.warn({ email: normalizedEmail }, 'Signup blocked: email already registered');
    throw new ConflictError('An account with this email address already exists.');
  }

  const pwdHash = await hashPassword(userData.password);
  const rawVerificationToken = generateRandomToken();
  const verificationTokenHash = hashToken(rawVerificationToken);

  // Transactionally create user and email verification token
  const { user } = await prisma.$transaction(async (tx) => {
    const newUser = await tx.user.create({
      data: {
        email: normalizedEmail,
        passwordHash: pwdHash,
        firstName: userData.firstName,
        lastName: userData.lastName,
        avatarUrl: userData.avatarUrl || null,
        status: 'ACTIVE'
      }
    });

    await tx.emailVerificationToken.create({
      data: {
        userId: newUser.id,
        tokenHash: verificationTokenHash,
        expiry: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY)
      }
    });

    await tx.auditLog.create({
      data: {
        userId: newUser.id,
        action: 'USER_SIGNUP',
        details: { email: normalizedEmail }
      }
    });

    return { user: newUser };
  });

  logger.info({ userId: user.id, email: user.email }, 'User signed up successfully');

  // Dispatch verification email in the background (prevent blocking the response)
  sendVerificationEmail(user.email, user.firstName, rawVerificationToken, origin)
    .catch((err) => logger.error({ err, userId: user.id }, 'Failed to send verification email'));

  // Return sanitized user response
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    avatarUrl: user.avatarUrl,
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    status: user.status,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

/**
 * Verify user email using the verification token.
 */
export async function verifyEmail(tokenValue) {
  const tokenHash = hashToken(tokenValue);

  // Fetch token and user
  const verificationRecord = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!verificationRecord) {
    throw new ValidationError('Invalid or expired verification token.');
  }

  // Idempotent success if already consumed and user is already verified
  if (verificationRecord.consumedAt) {
    if (verificationRecord.user.isEmailVerified) {
      return { success: true, message: 'Email already verified.' };
    }
    throw new ValidationError('Verification token has already been consumed.');
  }

  if (new Date() > verificationRecord.expiry) {
    throw new ValidationError('Verification token has expired.');
  }

  const user = verificationRecord.user;
  if (user.deletedAt) {
    throw new ValidationError('User associated with this token no longer exists.');
  }

  // Transactionally update user to verified and token as consumed
  await prisma.$transaction(async (tx) => {
    await tx.emailVerificationToken.update({
      where: { id: verificationRecord.id },
      data: { consumedAt: new Date() }
    });

    await tx.user.update({
      where: { id: user.id },
      data: { isEmailVerified: true }
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'EMAIL_VERIFIED'
      }
    });
  });

  logger.info({ userId: user.id }, 'Email verification successful');
  return { success: true, message: 'Email verified successfully.' };
}

/**
 * Login user and issue tokens.
 */
export async function login({ email, password, deviceInfo, userAgent, ipAddress }) {
  const normalizedEmail = email.toLowerCase();
  
  const user = await prisma.user.findFirst({
    where: { email: normalizedEmail, deletedAt: null }
  });

  // Generic errors for failed credentials to prevent account harvesting
  if (!user) {
    logger.warn({ email: normalizedEmail }, 'Failed login attempt: email not found');
    throw new AuthenticationError('Invalid email or password.');
  }

  // Compare passwords
  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    logger.warn({ userId: user.id }, 'Failed login attempt: incorrect password');
    throw new AuthenticationError('Invalid email or password.');
  }

  // Check email verification status
  if (!user.isEmailVerified) {
    logger.warn({ userId: user.id }, 'Login blocked: email not verified');
    throw new AuthenticationError('Please verify your email address before logging in.');
  }

  // Check account suspension status
  if (user.status === 'SUSPENDED') {
    logger.warn({ userId: user.id }, 'Login blocked: account suspended');
    throw new AuthenticationError('Your account has been suspended. Please contact support.');
  }

  if (user.status === 'DELETED') {
    logger.warn({ userId: user.id }, 'Login blocked: account deleted');
    throw new AuthenticationError('Your account has been deleted.');
  }

  const sessionId = crypto.randomUUID();
  const refreshToken = generateRefreshToken(user, sessionId);
  const refreshTokenHash = hashToken(refreshToken);
  const expirationTimestamp = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  // Transactionally create session and log login
  await prisma.$transaction(async (tx) => {
    await tx.session.create({
      data: {
        id: sessionId,
        userId: user.id,
        refreshTokenHash,
        deviceInfo,
        userAgent,
        ipAddress,
        expirationTimestamp
      }
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        ipAddress,
        userAgent,
        details: { sessionId }
      }
    });
  });

  const accessToken = generateAccessToken(user, sessionId);

  logger.info({ userId: user.id, sessionId }, 'User logged in successfully');

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  };
}

/**
 * Rotate refresh tokens (Refresh Token Rotation).
 */
export async function refreshTokens({ refreshToken, deviceInfo, userAgent, ipAddress }) {
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET, {
      issuer: 'xeno-auth-issuer',
      audience: 'xeno-saas-audience'
    });
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed token refresh: JWT verification failed');
    throw new AuthenticationError('Invalid refresh token.');
  }

  const { sub: userId, sessionId } = decoded;
  const incomingHash = hashToken(refreshToken);

  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true }
  });

  if (!session) {
    throw new AuthenticationError('Session not found.');
  }

  // REPLAY ATTACK DETECTION
  // If the session has already been revoked but a refresh token is presented, someone is reusing an old token!
  if (session.revokedTimestamp) {
    logger.error(
      { userId, sessionId, ipAddress, userAgent },
      'SUSPICIOUS: Revoked refresh token presented! Replay attack suspected. Revoking all sessions.'
    );
    
    // Revoke all sessions for this user to limit compromise exposure
    await prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId, revokedTimestamp: null },
        data: { revokedTimestamp: new Date() }
      });
      
      await tx.auditLog.create({
        data: {
          userId,
          action: 'SUSPICIOUS_REPLAY_ATTACK',
          ipAddress,
          userAgent,
          details: { sessionId }
        }
      });
    });

    throw new AuthenticationError('Session has been revoked due to security compromise.');
  }

  // Compare token hashes using timing safe comparison
  const isHashMatch = timingSafeCompare(session.refreshTokenHash, incomingHash);
  if (!isHashMatch) {
    logger.warn({ userId, sessionId }, 'Suspicious: Token hash mismatch');
    throw new AuthenticationError('Invalid refresh token.');
  }

  // Verify user integrity
  const user = session.user;
  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    throw new AuthenticationError('User account is inactive.');
  }

  const newSessionId = crypto.randomUUID();
  const newRefreshToken = generateRefreshToken(user, newSessionId);
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const newExpirationTimestamp = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  // Transactionally revoke old session and persist new session
  await prisma.$transaction(async (tx) => {
    // Revoke the old session
    await tx.session.update({
      where: { id: sessionId },
      data: { revokedTimestamp: new Date() }
    });

    // Create the new session
    await tx.session.create({
      data: {
        id: newSessionId,
        userId: user.id,
        refreshTokenHash: newRefreshTokenHash,
        deviceInfo: deviceInfo || session.deviceInfo,
        userAgent: userAgent || session.userAgent,
        ipAddress: ipAddress || session.ipAddress,
        expirationTimestamp: newExpirationTimestamp
      }
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'TOKEN_REFRESH',
        ipAddress,
        userAgent,
        details: { oldSessionId: sessionId, newSessionId: newSessionId }
      }
    });
  });

  const newAccessToken = generateAccessToken(user, newSessionId);

  logger.info({ userId: user.id, oldSessionId: sessionId, newSessionId }, 'Token rotated successfully');

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      isEmailVerified: user.isEmailVerified,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    }
  };
}

/**
 * Logout of current session.
 */
export async function logout(userId, sessionId) {
  await prisma.$transaction(async (tx) => {
    await tx.session.update({
      where: { id: sessionId },
      data: { revokedTimestamp: new Date() }
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'USER_LOGOUT',
        details: { sessionId }
      }
    });
  });

  logger.info({ userId, sessionId }, 'User logged out successfully');
}

/**
 * Revoke all active sessions of a user.
 */
export async function logoutAll(userId) {
  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        userId,
        revokedTimestamp: null,
        expirationTimestamp: { gt: new Date() }
      },
      data: { revokedTimestamp: new Date() }
    });

    await tx.auditLog.create({
      data: {
        userId,
        action: 'USER_LOGOUT_ALL'
      }
    });
  });

  logger.info({ userId }, 'All sessions revoked successfully');
}

/**
 * Process forgot password request.
 */
export async function forgotPassword(email, origin) {
  const normalizedEmail = email.toLowerCase();
  
  const user = await prisma.user.findFirst({
    where: { email: normalizedEmail, deletedAt: null }
  });

  // Never reveal account existence in response. Always return generic message.
  if (!user) {
    logger.info({ email: normalizedEmail }, 'Forgot password: email not registered. Sent generic response.');
    return { success: true, message: 'If that email exists, we have sent instructions to reset the password.' };
  }

  // Prevent resets for inactive accounts silently
  if (user.status !== 'ACTIVE') {
    logger.info({ userId: user.id }, 'Forgot password: blocked for inactive user. Sent generic response.');
    return { success: true, message: 'If that email exists, we have sent instructions to reset the password.' };
  }

  const rawResetToken = generateRandomToken();
  const resetTokenHash = hashToken(rawResetToken);
  const expiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: resetTokenHash,
        expiry
      }
    });

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_REQUESTED'
      }
    });
  });

  // Dispatch reset email in the background
  sendPasswordResetEmail(user.email, user.firstName, rawResetToken, origin)
    .catch((err) => logger.error({ err, userId: user.id }, 'Failed to send password reset email'));

  return { success: true, message: 'If that email exists, we have sent instructions to reset the password.' };
}

/**
 * Reset password using the verification token.
 */
export async function resetPassword(tokenValue, newPassword) {
  const tokenHash = hashToken(tokenValue);

  const resetRecord = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!resetRecord) {
    throw new ValidationError('Invalid or expired reset token.');
  }

  if (resetRecord.consumedAt) {
    throw new ValidationError('Password reset token has already been consumed.');
  }

  if (new Date() > resetRecord.expiry) {
    throw new ValidationError('Password reset token has expired.');
  }

  const user = resetRecord.user;
  if (user.deletedAt || user.status !== 'ACTIVE') {
    throw new ValidationError('User account is inactive or deleted.');
  }

  const newPwdHash = await hashPassword(newPassword);

  // In a transaction: update password, consume token, revoke all sessions
  await prisma.$transaction(async (tx) => {
    // 1. Update user password
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: newPwdHash }
    });

    // 2. Mark reset token as consumed
    await tx.passwordResetToken.update({
      where: { id: resetRecord.id },
      data: { consumedAt: new Date() }
    });

    // 3. Revoke all active sessions (force re-login everywhere for security compromise recovery)
    await tx.session.updateMany({
      where: {
        userId: user.id,
        revokedTimestamp: null,
        expirationTimestamp: { gt: new Date() }
      },
      data: { revokedTimestamp: new Date() }
    });

    // 4. Log audit log
    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'PASSWORD_RESET_COMPLETED'
      }
    });
  });

  logger.info({ userId: user.id }, 'Password reset successfully completed. All sessions revoked.');
  return { success: true, message: 'Password reset successfully. All sessions revoked.' };
}

export default {
  signUp,
  verifyEmail,
  login,
  refreshTokens,
  logout,
  logoutAll,
  forgotPassword,
  resetPassword
};
