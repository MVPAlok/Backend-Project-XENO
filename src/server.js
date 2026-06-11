import app from './app.js';
import env from './config/env.js';
import prisma from './config/database.js';
import logger from './utils/logger.js';

const server = app.listen(env.PORT, () => {
  logger.info(`🚀 Server running in [${env.NODE_ENV}] mode on port ${env.PORT}`);
});

/**
 * Handle graceful shutdown of the server and database connections.
 * @param {string} signal - The process signal received
 */
async function handleShutdown(signal) {
  logger.info(`Received ${signal}. Commencing graceful shutdown...`);

  // Stop accepting new HTTP requests
  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      // Gracefully sever Prisma connection
      await prisma.$disconnect();
      logger.info('Database connections disconnected successfully.');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'Database disconnection failed during shutdown.');
      process.exit(1);
    }
  });

  // Force shutdown safeguard (10s timeout)
  setTimeout(() => {
    logger.error('Graceful shutdown timed out. Forcefully exiting...');
    process.exit(1);
  }, 10000);
}

// OS Signal Traps
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

// Centralized Unhandled Failures logging
process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'FATAL: Unhandled Promise Rejection');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'FATAL: Uncaught Exception');
  process.exit(1);
});
