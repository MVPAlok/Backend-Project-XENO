import crypto from 'crypto';

export const generateVerificationToken = () => {
  const resetToken = crypto.randomBytes(32).toString('hex'); // 64-character hex string
  const hashedToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  return { resetToken, hashedToken };
};
