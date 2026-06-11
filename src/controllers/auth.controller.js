import authService from '../services/auth.service.js';

/**
 * Handle new user sign up.
 */
export async function handleSignUp(req, res, next) {
  try {
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const result = await authService.signUp(req.body, origin);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle email verification token check.
 */
export async function handleVerifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    const result = await authService.verifyEmail(token);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle user login.
 */
export async function handleLogin(req, res, next) {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || null;
    const deviceInfo = req.headers['x-device-info'] || null;

    const result = await authService.login({
      email: req.body.email,
      password: req.body.password,
      deviceInfo,
      userAgent,
      ipAddress
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle refresh token rotation.
 */
export async function handleRefresh(req, res, next) {
  try {
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || null;
    const deviceInfo = req.headers['x-device-info'] || null;
    const { refreshToken } = req.body;

    const result = await authService.refreshTokens({
      refreshToken,
      deviceInfo,
      userAgent,
      ipAddress
    });

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle single device logout.
 */
export async function handleLogout(req, res, next) {
  try {
    const { id: userId, sessionId } = req.user;
    await authService.logout(userId, sessionId);
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle all devices logout.
 */
export async function handleLogoutAll(req, res, next) {
  try {
    const { id: userId } = req.user;
    await authService.logoutAll(userId);
    return res.status(200).json({ success: true });
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle forgot password request.
 */
export async function handleForgotPassword(req, res, next) {
  try {
    const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
    const { email } = req.body;
    const result = await authService.forgotPassword(email, origin);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle password reset completed.
 */
export async function handleResetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const result = await authService.resetPassword(token, password);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

/**
 * Handle fetching current authenticated user profile.
 */
export async function handleMe(req, res, next) {
  try {
    // req.user was already resolved and sanitized in requireAuth middleware
    const userProfile = {
      id: req.user.id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      avatarUrl: req.user.avatarUrl,
      role: req.user.role,
      isEmailVerified: req.user.isEmailVerified,
      status: req.user.status
    };
    return res.status(200).json(userProfile);
  } catch (error) {
    return next(error);
  }
}

export default {
  handleSignUp,
  handleVerifyEmail,
  handleLogin,
  handleRefresh,
  handleLogout,
  handleLogoutAll,
  handleForgotPassword,
  handleResetPassword,
  handleMe
};
