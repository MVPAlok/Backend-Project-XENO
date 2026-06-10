import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import requestLogger from './middleware/requestLogger.js';
import errorHandler from './middleware/errorHandler.js';
import env from './config/env.js';

const app = express();

// Set security headers
app.use(helmet());

// Configure CORS
const corsOrigins = env.CORS_ORIGIN === '*' ? '*' : env.CORS_ORIGIN.split(',');
app.use(
  cors({
    origin: corsOrigins,
    credentials: true,
  })
);

// Body parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// HTTP Request logging
app.use(requestLogger);

// Health check route
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: env.NODE_ENV,
  });
});

// Catch-all route not found handler
app.use((req, res, next) => {
  const error = new Error(`Route Not Found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
});

// Global error handler
app.use(errorHandler);

export default app;
