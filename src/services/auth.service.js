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
function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role
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
function generateRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      jti: crypto.randomUUID()
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

  const newUser = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash: pwdHash,
      firstName: userData.firstName,
      lastName: userData.lastName,
      avatarUrl: userData.avatarUrl || null,
      status: 'ACTIVE',
      emailVerificationToken: verificationTokenHash,
      emailVerificationExpiry: new Date(Date.now() + VERIFICATION_TOKEN_EXPIRY)
    }
  });

  logger.info({ userId: newUser.id, email: newUser.email }, 'User signed up successfully');

  // Dispatch verification email in the background (prevent blocking the response)
  sendVerificationEmail(newUser.email, newUser.firstName, rawVerificationToken, origin)
    .catch((err) => logger.error({ err, userId: newUser.id }, 'Failed to send verification email'));

  // Return sanitized user response
  return {
    id: newUser.id,
    email: newUser.email,
    firstName: newUser.firstName,
    lastName: newUser.lastName,
    avatarUrl: newUser.avatarUrl,
    role: newUser.role,
    isEmailVerified: newUser.isEmailVerified,
    status: newUser.status,
    createdAt: newUser.createdAt,
    updatedAt: newUser.updatedAt
  };
}

/**
 * Verify user email using the verification token.
 */
export async function verifyEmail(tokenValue) {
  const tokenHash = hashToken(tokenValue);

  // Fetch user by token
  const user = await prisma.user.findUnique({
    where: { emailVerificationToken: tokenHash }
  });

  if (!user) {
    throw new ValidationError('Invalid or expired verification token.');
  }

  if (new Date() > user.emailVerificationExpiry) {
    throw new ValidationError('Verification token has expired.');
  }

  if (user.deletedAt) {
    throw new ValidationError('User associated with this token no longer exists.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { 
      isEmailVerified: true,
      emailVerificationToken: null,
      emailVerificationExpiry: null
    }
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

  if (!user) {
    logger.warn({ email: normalizedEmail }, 'Failed login attempt: email not found');
    throw new AuthenticationError('Invalid email or password.');
  }

  const isMatch = await comparePassword(password, user.passwordHash);
  if (!isMatch) {
    logger.warn({ userId: user.id }, 'Failed login attempt: incorrect password');
    throw new AuthenticationError('Invalid email or password.');
  }

  if (!user.isEmailVerified) {
    logger.warn({ userId: user.id }, 'Login blocked: email not verified');
    throw new AuthenticationError('Please verify your email address before logging in.');
  }

  if (user.status === 'SUSPENDED') {
    logger.warn({ userId: user.id }, 'Login blocked: account suspended');
    throw new AuthenticationError('Your account has been suspended. Please contact support.');
  }

  if (user.status === 'DELETED') {
    logger.warn({ userId: user.id }, 'Login blocked: account deleted');
    throw new AuthenticationError('Your account has been deleted.');
  }

  const refreshToken = generateRefreshToken(user);
  const refreshTokenHash = hashToken(refreshToken);
  const expirationTimestamp = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshTokenHash,
      sessionExpiry: expirationTimestamp,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress || null
    }
  });

  const accessToken = generateAccessToken(user);

  logger.info({ userId: user.id }, 'User logged in successfully');

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

  const userId = decoded.sub;
  const incomingHash = hashToken(refreshToken);

  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    throw new AuthenticationError('User account is inactive.');
  }

  if (!user.refreshTokenHash || !user.sessionExpiry || new Date() > user.sessionExpiry) {
    throw new AuthenticationError('Session expired or revoked.');
  }

  // REPLAY ATTACK DETECTION
  const isHashMatch = timingSafeCompare(user.refreshTokenHash, incomingHash);
  if (!isHashMatch) {
    logger.error(
      { userId, ipAddress, userAgent },
      'SUSPICIOUS: Refresh token hash mismatch! Replay attack suspected. Revoking session.'
    );
    
    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null, sessionExpiry: null }
    });

    throw new AuthenticationError('Session has been revoked due to security compromise.');
  }

  const newRefreshToken = generateRefreshToken(user);
  const newRefreshTokenHash = hashToken(newRefreshToken);
  const newExpirationTimestamp = new Date(Date.now() + REFRESH_TOKEN_EXPIRY);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      refreshTokenHash: newRefreshTokenHash,
      sessionExpiry: newExpirationTimestamp,
      lastLoginAt: new Date(),
      lastLoginIp: ipAddress || null
    }
  });

  const newAccessToken = generateAccessToken(user);

  logger.info({ userId: user.id }, 'Token rotated successfully');

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
export async function logout(userId) {
  await prisma.user.update({
    where: { id: userId },
    data: { refreshTokenHash: null, sessionExpiry: null }
  });

  logger.info({ userId }, 'User logged out successfully');
}

/**
 * Revoke all active sessions of a user (same as single logout in this schema).
 */
export async function logoutAll(userId) {
  await logout(userId);
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

  if (!user || user.status !== 'ACTIVE') {
    logger.info({ email: normalizedEmail }, 'Forgot password: email not registered or inactive.');
    return { success: true, message: 'If that email exists, we have sent instructions to reset the password.' };
  }

  const rawResetToken = generateRandomToken();
  const resetTokenHash = hashToken(rawResetToken);
  const expiry = new Date(Date.now() + PASSWORD_RESET_EXPIRY);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: resetTokenHash,
      passwordResetExpiry: expiry
    }
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

  const user = await prisma.user.findUnique({
    where: { passwordResetToken: tokenHash }
  });

  if (!user || !user.passwordResetExpiry) {
    throw new ValidationError('Invalid or expired reset token.');
  }

  if (new Date() > user.passwordResetExpiry) {
    throw new ValidationError('Password reset token has expired.');
  }

  if (user.deletedAt || user.status !== 'ACTIVE') {
    throw new ValidationError('User account is inactive or deleted.');
  }

  const newPwdHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { 
      passwordHash: newPwdHash,
      passwordResetToken: null,
      passwordResetExpiry: null,
      refreshTokenHash: null,
      sessionExpiry: null
    }
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
