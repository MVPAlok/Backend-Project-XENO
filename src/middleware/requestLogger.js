import morgan from 'morgan';
import logger from '../config/logger.js';

// Custom log stream piping Morgan outputs directly into the Pino logger
const stream = {
  write: (message) => logger.info({ type: 'http' }, message.trim()),
};

// Morgan format configuration
const format =
  ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"';

export const requestLogger = morgan(format, { stream });
export default requestLogger;
