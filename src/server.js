import app from './app.js';
import env from './config/env.js';
import logger from './config/logger.js';

// Start Express HTTP listener
const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server listening on port ${env.PORT} in [${env.NODE_ENV}] mode`);
});

// Graceful shutdown logic
const gracefulShutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server closed. Exiting process.');
    process.exit(0);
  });

  // Forcefully terminate after a safety timeout (10 seconds)
  setTimeout(() => {
    logger.error('Could not close active connections in time, forcefully exiting.');
    process.exit(1);
  }, 10000).unref(); // unref so timeout doesn't block event loop exit if not needed
};

// Handle OS signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Catch unexpected application issues
process.on('uncaughtException', (error) => {
  logger.fatal(error, 'Uncaught Exception crashed the process!');
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled Promise Rejection detected!');
  process.exit(1);
});
