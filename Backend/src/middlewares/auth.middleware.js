import { verifyAccessToken } from '../utils/token.js';
import prisma from '../config/prisma.js';

export const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];

    try {
      const decoded = verifyAccessToken(token);

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, isActive: true },
      });

      if (!user) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: User not found' });
      }

      if (!user.isActive) {
        return res.status(401).json({ status: 'error', message: 'Unauthorized: User is inactive' });
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
