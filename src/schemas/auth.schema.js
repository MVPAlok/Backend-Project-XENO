import { z } from 'zod';

const passwordComplexitySchema = z.string()
  .min(8, 'Password must be at least 8 characters long.')
  .max(100, 'Password must not exceed 100 characters.')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter.')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter.')
  .regex(/[0-9]/, 'Password must contain at least one numeric digit.')
  .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one special character.');

const normalizedEmailSchema = z.string()
  .trim()
  .toLowerCase()
  .email('Please enter a valid email address.');

export const signupSchema = z.object({
  body: z.object({
    email: normalizedEmailSchema,
    password: passwordComplexitySchema,
    firstName: z.string().trim().min(1, 'First name is required.').max(50),
    lastName: z.string().trim().min(1, 'Last name is required.').max(50),
    avatarUrl: z.string().url('Avatar must be a valid URL.').optional().or(z.literal(''))
  })
});

export const loginSchema = z.object({
  body: z.object({
    email: normalizedEmailSchema,
    password: z.string().min(1, 'Password is required.')
  })
});

export const verifyEmailSchema = z.object({
  query: z.object({
    token: z.string().min(1, 'Verification token is required.')
  })
});

export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required.')
  })
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: normalizedEmailSchema
  })
});

export const resetPasswordSchema = z.object({
  body: z.object({
    token: z.string().min(1, 'Reset token is required.'),
    password: passwordComplexitySchema
  })
});

export default {
  signupSchema,
  loginSchema,
  verifyEmailSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema
};
