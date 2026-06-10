import { verifyAccessToken } from '../utils/token.js';
import prisma from '../config/prisma.js';

export const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.accessToken;

    if (!token) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized: No token provided' });
    }

    try {
      const decoded = verifyAccessToken(token);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, isActive: true, tokenVersion: true, isEmailVerified: true },
      });

      if (!user) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: User not found' });
      }

      if (!user.isActive) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: User is inactive' });
      }

      if (user.tokenVersion !== decoded.tokenVersion) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: Token revoked' });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized: Invalid or expired token' });
    }
  } catch (error) {
    next(error);
  }
};
