import logger from '../config/logger.js';
import env from '../config/env.js';

// Global express error handler middleware
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const isProduction = env.NODE_ENV === 'production';

  // Log structured details of the exception
  logger.error(
    {
      err: {
        message: err.message,
        stack: err.stack,
        code: err.code,
      },
      req: {
        method: req.method,
        url: req.url,
        ip: req.ip,
      },
    },
    'An unhandled exception occurred during request handling'
  );

  // Respond to the client with clean formatted details
  res.status(statusCode).json({
    error: {
      message: isProduction && statusCode === 500 ? 'Internal Server Error' : err.message,
      status: statusCode,
      ...(!isProduction && { stack: err.stack, details: err.details || null }),
    },
  });
};

export default errorHandler;
