import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import authRoutes from './routes/auth.routes.js';
import workspaceRoutes from './modules/workspace/workspace.routes.js';
import errorMiddleware from './middlewares/error.middleware.js';
import logger from './utils/logger.js';
import env from './config/env.js';

const app = express();

// 1. HTTP Security Headers
app.use(helmet());

// 2. Cross-Origin Resource Sharing
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true
}));

// 3. Body Parsing with Payload Limits
app.use(express.json({ limit: '10kb' }));

// 4. Request Logging Middleware
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.originalUrl,
    ip: req.ip
  }, `Incoming Request: ${req.method} ${req.originalUrl}`);
  next();
});

// 5. Mount API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/workspaces', workspaceRoutes);

// 6. Catch-all 404 Handler
app.use((req, res) => {
  res.setHeader('Content-Type', 'application/problem+json');
  return res.status(404).json({
    type: 'about:blank',
    title: 'Not Found',
    status: 404,
    detail: `Route '${req.originalUrl}' not found.`,
    instance: req.originalUrl
  });
});

// 7. Centralized Error Handler
app.use(errorMiddleware);

export default app;
export { app };
