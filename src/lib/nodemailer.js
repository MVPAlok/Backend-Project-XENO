import nodemailer from 'nodemailer';
import env from '../config/env.js';
import logger from '../utils/logger.js';

const config = {
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
};

if (env.SMTP_USER && env.SMTP_PASS) {
  config.auth = {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  };
}

const transporter = nodemailer.createTransport(config);

transporter.verify((error) => {
  if (error) {
    logger.error({ err: error }, '❌ SMTP connection configuration error');
  } else {
    logger.info('📧 SMTP connection established successfully');
  }
});

export default transporter;
export { transporter };
