import rateLimit from 'express-rate-limit';

/**
 * Factory helper to build endpoint-specific rate limiters.
 * Returns standard RFC7807 problem details response on rate limit breaches.
 */
const createLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true, // Return rate limit info in standard headers
    legacyHeaders: false,  // Disable older headers
    skip: (req) => process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit'],
    handler: (req, res) => {
      res.setHeader('Content-Type', 'application/problem+json');
      return res.status(429).json({
        type: 'about:blank',
        title: 'Too Many Requests',
        status: 429,
        detail: message,
        instance: req.originalUrl
      });
    }
  });
};

export const loginLimiter = createLimiter(
  15 * 60 * 1000, // 15 minutes
  5,
  'Too many login attempts from this IP. Please try again after 15 minutes.'
);

export const signupLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  5,
  'Too many accounts created from this IP. Please try again after an hour.'
);

export const forgotPasswordLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  3,
  'Too many password reset requests from this IP. Please try again after an hour.'
);

export const verifyEmailLimiter = createLimiter(
  60 * 60 * 1000, // 1 hour
  5,
  'Too many verification attempts from this IP. Please try again after an hour.'
);

export const refreshTokenLimiter = createLimiter(
  15 * 60 * 1000, // 15 minutes
  30,
  'Too many refresh attempts from this IP. Please try again after 15 minutes.'
);

export const audienceGenLimiter = createLimiter(
  15 * 60 * 1000, // 15 minutes
  5, // Limit to 5 requests in tests if enabled
  'Too many audience generation requests. Please try again after 15 minutes.'
);

export default {
  loginLimiter,
  signupLimiter,
  forgotPasswordLimiter,
  verifyEmailLimiter,
  refreshTokenLimiter,
  audienceGenLimiter
};
