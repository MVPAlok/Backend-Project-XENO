import jwt from 'jsonwebtoken';
import env from '../config/env.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';
import prisma from '../config/database.js';

/**
 * Require a valid JWT Access Token.
 * Validates expiration, signature, and checks user/session states in the DB.
 */
export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Access token is missing or malformed.');
    }

    const token = authHeader.split(' ')[1];
    
    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
        issuer: 'xeno-auth-issuer',
        audience: 'xeno-saas-audience'
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw new AuthenticationError('Access token has expired.');
      }
      throw new AuthenticationError('Invalid or malformed access token.');
    }

    const { sub: userId } = decoded;

    // Lookup user to verify session state
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user || user.deletedAt) {
      throw new AuthenticationError('User account not found or deleted.');
    }

    if (!user.refreshTokenHash) {
      throw new AuthenticationError('Active session not found or has been revoked.');
    }

    if (user.sessionExpiry && new Date() > user.sessionExpiry) {
      throw new AuthenticationError('Session has expired.');
    }

    if (user.status === 'SUSPENDED') {
      throw new AuthenticationError('Your account has been suspended.');
    }

    if (user.status === 'DELETED') {
      throw new AuthenticationError('Your account has been deleted.');
    }

    // Attach user information to the request context
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl,
      isEmailVerified: user.isEmailVerified,
      status: user.status
    };

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Authorize users based on their roles.
 * @param {...string} allowedRoles - list of roles allowed to access the route
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AuthenticationError('Authentication required.'));
    }
    
    if (!allowedRoles.includes(req.user.role)) {
      return next(new AuthorizationError('Insufficient privileges to access this resource.'));
    }
    
    return next();
  };
}
