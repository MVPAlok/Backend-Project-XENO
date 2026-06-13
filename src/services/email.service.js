import transporter from '../lib/nodemailer.js';
import env from '../config/env.js';
import logger from '../utils/logger.js';

/**
 * Low-level utility to send raw email.
 * @param {object} options 
 * @param {string} options.to
 * @param {string} options.subject
 * @param {string} options.html
 * @param {string} options.text
 * @returns {Promise<any>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const mailOptions = {
    from: env.SMTP_FROM,
    to,
    subject,
    html,
    text,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info({ messageId: info.messageId, to, subject }, 'Email dispatched successfully');
    return info;
  } catch (error) {
    logger.error({ err: error, to, subject }, 'Failed to dispatch email');
    throw error;
  }
}

/**
 * Send account email verification message.
 * @param {string} email 
 * @param {string} firstName 
 * @param {string} token Raw verification token 
 * @param {string} origin Frontend origin URL
 * @returns {Promise<any>}
 */
export async function sendVerificationEmail(email, firstName, token, origin = 'http://localhost:3000') {
  const verificationLink = `${origin}/auth/verify-email?token=${token}`;
  
  if (env.NODE_ENV === 'development') {
    logger.info({ verificationLink }, '🛠️ DEVELOPMENT MODE: Verification Link');
  }

  const subject = 'Verify your email address';
  const text = `Hi ${firstName},\n\nPlease verify your email address by visiting this link: ${verificationLink}\n\nThis verification link is valid for 24 hours.`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Verification</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .email-container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .email-header { background: linear-gradient(135deg, #4f46e5 0%, #312e81 100%); padding: 32px; text-align: center; color: #ffffff; }
    .email-header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; }
    .email-body { padding: 40px 32px; }
    .email-body p { margin-top: 0; margin-bottom: 24px; font-size: 16px; line-height: 1.6; color: #4b5563; }
    .email-body strong { color: #111827; }
    .cta-button { display: inline-block; padding: 14px 28px; background-color: #4f46e5; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(79, 70, 229, 0.2); transition: background-color 0.2s; }
    .cta-container { text-align: center; margin: 32px 0; }
    .email-footer { background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #f3f4f6; text-align: center; font-size: 13px; color: #9ca3af; }
    .email-footer a { color: #4f46e5; text-decoration: none; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Verify Your Email</h1>
    </div>
    <div class="email-body">
      <p>Hi ${firstName},</p>
      <p>Thank you for registering! To complete your signup and activate your account, please verify your email address by clicking the button below.</p>
      <div class="cta-container">
        <a href="${verificationLink}" class="cta-button" target="_blank">Verify Email Address</a>
      </div>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 14px; background-color: #f3f4f6; padding: 12px; border-radius: 6px;"><a href="${verificationLink}">${verificationLink}</a></p>
      <p>This verification link will expire in <strong>24 hours</strong>.</p>
    </div>
    <div class="email-footer">
      <p>If you did not sign up for this account, you can safely ignore this email.</p>
      <p>&copy; ${new Date().getFullYear()} XENO SaaS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, html, text });
}

/**
 * Send password reset instruction message.
 * @param {string} email 
 * @param {string} firstName 
 * @param {string} token Raw reset token
 * @param {string} origin Frontend origin URL
 * @returns {Promise<any>}
 */
export async function sendPasswordResetEmail(email, firstName, token, origin = 'http://localhost:3000') {
  const resetLink = `${origin}/auth/reset-password?token=${token}`;
  
  if (env.NODE_ENV === 'development') {
    logger.info({ resetLink }, '🛠️ DEVELOPMENT MODE: Password Reset Link');
  }

  const subject = 'Reset your password';
  const text = `Hi ${firstName},\n\nYou requested to reset your password. Please click this link to complete the reset: ${resetLink}\n\nThis password reset link is valid for 1 hour.`;
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #1f2937; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
    .email-container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); }
    .email-header { background: linear-gradient(135deg, #ef4444 0%, #991b1b 100%); padding: 32px; text-align: center; color: #ffffff; }
    .email-header h1 { margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.025em; }
    .email-body { padding: 40px 32px; }
    .email-body p { margin-top: 0; margin-bottom: 24px; font-size: 16px; line-height: 1.6; color: #4b5563; }
    .email-body strong { color: #111827; }
    .cta-button { display: inline-block; padding: 14px 28px; background-color: #ef4444; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.2); transition: background-color 0.2s; }
    .cta-container { text-align: center; margin: 32px 0; }
    .email-footer { background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #f3f4f6; text-align: center; font-size: 13px; color: #9ca3af; }
    .email-footer a { color: #ef4444; text-decoration: none; }
  </style>
</head>
<body>
  <div class="email-container">
    <div class="email-header">
      <h1>Reset Your Password</h1>
    </div>
    <div class="email-body">
      <p>Hi ${firstName},</p>
      <p>We received a request to reset the password for your account. You can reset your password by clicking the button below.</p>
      <div class="cta-container">
        <a href="${resetLink}" class="cta-button" target="_blank">Reset Password</a>
      </div>
      <p>If you did not request a password reset, you can safely ignore this email; your password will remain unchanged.</p>
      <p>If the button doesn't work, copy and paste this link into your browser:</p>
      <p style="word-break: break-all; font-size: 14px; background-color: #f3f4f6; padding: 12px; border-radius: 6px;"><a href="${resetLink}">${resetLink}</a></p>
      <p>This reset link will expire in <strong>1 hour</strong>.</p>
    </div>
    <div class="email-footer">
      <p>This is an automated security email. Please do not reply.</p>
      <p>&copy; ${new Date().getFullYear()} XENO SaaS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, html, text });
}
export default { sendEmail, sendVerificationEmail, sendPasswordResetEmail };
