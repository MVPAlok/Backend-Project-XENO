import { Router } from 'express';
import { 
  handleSignUp, 
  handleVerifyEmail, 
  handleLogin, 
  handleRefresh, 
  handleLogout, 
  handleLogoutAll, 
  handleForgotPassword, 
  handleResetPassword, 
  handleMe 
} from '../controllers/auth.controller.js';
import { validate } from '../middlewares/validation.middleware.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { 
  signupLimiter, 
  verifyEmailLimiter, 
  loginLimiter, 
  refreshTokenLimiter, 
  forgotPasswordLimiter 
} from '../middlewares/rate-limit.middleware.js';
import { 
  signupSchema, 
  loginSchema, 
  verifyEmailSchema, 
  refreshTokenSchema, 
  forgotPasswordSchema, 
  resetPasswordSchema 
} from '../schemas/auth.schema.js';

const router = Router();

// 1. Sign Up
router.post(
  '/signup',
  signupLimiter,
  validate(signupSchema),
  handleSignUp
);

// 2. Email Verification
router.get(
  '/verify-email',
  verifyEmailLimiter,
  validate(verifyEmailSchema),
  handleVerifyEmail
);

// 3. Login
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  handleLogin
);

// 4. Refresh Token Rotation
router.post(
  '/refresh',
  refreshTokenLimiter,
  validate(refreshTokenSchema),
  handleRefresh
);

// 5. Logout (Single Device)
router.post(
  '/logout',
  requireAuth,
  handleLogout
);

// 6. Logout (All Devices)
router.post(
  '/logout-all',
  requireAuth,
  handleLogoutAll
);

// 7. Forgot Password
router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  validate(forgotPasswordSchema),
  handleForgotPassword
);

// 8. Reset Password
router.post(
  '/reset-password',
  loginLimiter, // Reuses login limiting window for password writes
  validate(resetPasswordSchema),
  handleResetPassword
);

// 9. Get Current User
router.get(
  '/me',
  requireAuth,
  handleMe
);

export default router;
