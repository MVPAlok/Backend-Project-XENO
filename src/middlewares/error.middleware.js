import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Global Express error handling middleware.
 * Formats errors conforming to RFC7807 (Problem Details).
 */
export function errorMiddleware(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let title = err.title || 'Internal Server Error';
  let detail = err.message || 'An unexpected error occurred on the server.';
  let errors = err.details || null;

  // Log non-operational (system/developer) errors as error level
  if (!(err instanceof AppError)) {
    logger.error({ 
      err: {
        message: err.message,
        stack: err.stack,
        ...err
      },
      req: {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip
      }
    }, 'Unhandled system exception');

    if (process.env.NODE_ENV === 'production') {
      detail = 'An unexpected error occurred on the server.';
    } else {
      detail = err.message;
      errors = { stack: err.stack };
    }
  } else {
    // Log operational error with info level
    logger.info({ 
      statusCode, 
      message: err.message, 
      url: req.originalUrl 
    }, `Operational error: ${err.message}`);
  }

  res.setHeader('Content-Type', 'application/problem+json');
  return res.status(statusCode).json({
    type: 'about:blank',
    title,
    status: statusCode,
    detail,
    instance: req.originalUrl,
    ...(errors && { errors })
  });
}
export default errorMiddleware;
