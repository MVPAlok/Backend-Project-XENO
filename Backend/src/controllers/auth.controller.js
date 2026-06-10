import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { generateAccessToken, generateRefreshToken } from '../utils/token.js';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies.js';
import { generateVerificationToken } from '../utils/crypto.js';
import { env } from '../config/env.js';

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const generateTokens = (userId, role, tokenVersion) => {
  const accessToken = generateAccessToken(userId, role, tokenVersion);
  const refreshToken = generateRefreshToken(userId, tokenVersion);
  return { accessToken, refreshToken };
};

export const signup = async (req, res, next) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: 'error', errors: parsed.error.format() });
    }

    const { email, password, firstName, lastName } = parsed.data;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(409).json({ status: 'error', message: 'Email is already in use' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    const { resetToken, hashedToken } = generateVerificationToken();

    const newUser = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName,
        lastName,
        verificationToken: hashedToken,
        verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      },
    });

    const verificationUrl = `${env.CLIENT_URL}/verify-email?token=${resetToken}`;
    console.log(`
┌────────────────────────────────────────────────────────┐
│ [MOCK EMAIL] Verification Email Sent                   │
├────────────────────────────────────────────────────────┤
│ To: ${email}                                           │
│ Link: ${verificationUrl}                              │
└────────────────────────────────────────────────────────┘
    `);

    const { accessToken, refreshToken } = generateTokens(newUser.id, newUser.role, newUser.tokenVersion);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      status: 'success',
      message: 'User created. Please verify your email.',
      data: {
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ status: 'error', errors: parsed.error.format() });
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(401).json({ status: 'error', message: 'Account is inactive' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role, user.tokenVersion);
    setAuthCookies(res, accessToken, refreshToken);

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    if (req.user) {
      // Optional: Increment tokenVersion to globally invalidate all active tokens for this user
      await prisma.user.update({
        where: { id: req.user.id },
        data: { tokenVersion: { increment: 1 } },
      });
    }

    clearAuthCookies(res);
    res.status(200).json({ status: 'success', message: 'Logged out successfully' });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body; 

    if (!token) {
      return res.status(400).json({ status: 'error', message: 'Token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: hashedToken,
        verificationExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ status: 'error', message: 'Invalid or expired verification token' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        isEmailVerified: true,
        verificationToken: null,
        verificationExpires: null,
      },
    });

    res.status(200).json({ status: 'success', message: 'Email verified successfully' });
  } catch (error) {
    next(error);
  }
};

export const resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Email is required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || user.isEmailVerified) {
      return res.status(400).json({ status: 'error', message: 'User not found or already verified' });
    }

    const { resetToken, hashedToken } = generateVerificationToken();

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken: hashedToken,
        verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const verificationUrl = `${env.CLIENT_URL}/verify-email?token=${resetToken}`;
    console.log(`
┌────────────────────────────────────────────────────────┐
│ [MOCK EMAIL] Verification Email Sent (Resend)          │
├────────────────────────────────────────────────────────┤
│ To: ${email}                                           │
│ Link: ${verificationUrl}                              │
└────────────────────────────────────────────────────────┘
    `);

    res.status(200).json({ status: 'success', message: 'Verification email resent' });
  } catch (error) {
    next(error);
  }
};
