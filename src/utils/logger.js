import pino from 'pino';
import env from '../config/env.js';

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'refreshToken',
      'accessToken',
      'secret',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.refreshToken',
      '*.accessToken',
      '*.secret',
      'body.password',
      'body.token',
      'body.refreshToken',
      'body.accessToken',
      'body.secret'
    ],
    censor: '[REDACTED]'
  },
  transport: env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname'
    }
  } : undefined
});

export default logger;
export { logger };
