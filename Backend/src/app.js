import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { logger } from './utils/logger.js';
import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

// Security HTTP headers
app.use(helmet());

// CORS configuration
app.use(cors());

// Parse JSON request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP request logging piped to pino
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Unknown API request handler
app.use((req, res, next) => {
  const err = new Error(`Not Found - ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
});

// Global error handler
app.use(errorHandler);

export default app;
