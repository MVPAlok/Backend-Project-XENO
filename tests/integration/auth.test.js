import request from 'supertest';
import { describe, it, expect } from 'vitest';
import app from '../../src/app.js';
import prisma from '../../src/config/database.js';
import { hashPassword, hashToken, comparePassword } from '../../src/utils/crypto.js';

describe('Authentication API Integration Tests', () => {
  const testUser = {
    email: 'architect@xeno.com',
    password: 'Password123!',
    firstName: 'Principal',
    lastName: 'Architect'
  };

  describe('POST /auth/signup', () => {
    it('should successfully sign up a new user and return user details (excluding password)', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send(testUser);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.email).toBe(testUser.email.toLowerCase());
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(res.body.isEmailVerified).toBe(false);

      // Verify DB records
      const user = await prisma.user.findUnique({ where: { email: testUser.email.toLowerCase() } });
      expect(user).toBeTruthy();
      expect(user.isEmailVerified).toBe(false);

      const token = await prisma.emailVerificationToken.findFirst({ where: { userId: user.id } });
      expect(token).toBeTruthy();
      expect(token.tokenHash).toBeTruthy();
    });

    it('should fail registration with validation errors for invalid password complexity', async () => {
      const res = await request(app)
        .post('/auth/signup')
        .send({
          ...testUser,
          password: '123' // too short, no upper/lower/special
        });

      expect(res.status).toBe(400);
      expect(res.body.title).toBe('Bad Request / Validation Error');
      expect(res.body.errors[0].field).toBe('password');
    });

    it('should reject signup with 409 Conflict if email is already in use', async () => {
      // Create user
      await request(app).post('/auth/signup').send(testUser);
      // Attempt again
      const res = await request(app).post('/auth/signup').send(testUser);

      expect(res.status).toBe(409);
      expect(res.body.detail).toContain('already exists');
    });
  });

  describe('POST /auth/verify-email', () => {
    it('should successfully verify email with correct token and mark token consumed', async () => {
      // Create user and get token
      await request(app).post('/auth/signup').send(testUser);
      const user = await prisma.user.findUnique({ where: { email: testUser.email.toLowerCase() } });
      
      // We need to look up token. Since it is hashed in DB, we'll mock verification by grabbing the token from DB
      const dbToken = await prisma.emailVerificationToken.findFirst({ where: { userId: user.id } });
      
      // Let's create a known token hash in database so we can test with its raw value
      const rawToken = 'abcdef1234567890abcdef1234567890';
      const tokenHash = hashToken(rawToken);
      
      await prisma.emailVerificationToken.update({
        where: { id: dbToken.id },
        data: { tokenHash }
      });

      const res = await request(app)
        .post(`/auth/verify-email?token=${rawToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('verified successfully');

      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser.isEmailVerified).toBe(true);

      const updatedToken = await prisma.emailVerificationToken.findUnique({ where: { id: dbToken.id } });
      expect(updatedToken.consumedAt).toBeTruthy();
    });
  });

  describe('POST /auth/login', () => {
    it('should block login if user email is not verified', async () => {
      // Create user (unverified by default)
      await request(app).post('/auth/signup').send(testUser);

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).toBe(401);
      expect(res.body.detail).toContain('verify your email');
    });

    it('should login verified user and return tokens', async () => {
      // Create user
      const passwordHash = await hashPassword(testUser.password);
      const user = await prisma.user.create({
        data: {
          email: testUser.email.toLowerCase(),
          passwordHash,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          isEmailVerified: true
        }
      });

      const res = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.user.email).toBe(testUser.email.toLowerCase());

      const sessionsCount = await prisma.session.count({ where: { userId: user.id } });
      expect(sessionsCount).toBe(1);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should successfully rotate tokens and revoke old session', async () => {
      // Setup verified user
      const passwordHash = await hashPassword(testUser.password);
      await prisma.user.create({
        data: {
          email: testUser.email.toLowerCase(),
          passwordHash,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          isEmailVerified: true
        }
      });

      // Login
      const loginRes = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password
        });

      const { refreshToken } = loginRes.body;

      // Refresh
      const refreshRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body).toHaveProperty('accessToken');
      expect(refreshRes.body).toHaveProperty('refreshToken');

      // Verify old session has been marked revoked
      const oldSession = await prisma.session.findFirst({
        where: { revokedTimestamp: { not: null } }
      });
      expect(oldSession).toBeTruthy();

      // Verify new session exists
      const newSession = await prisma.session.findFirst({
        where: { revokedTimestamp: null }
      });
      expect(newSession).toBeTruthy();
    });

    it('should detect replay attack and revoke all active sessions on token reuse', async () => {
      const passwordHash = await hashPassword(testUser.password);
      const user = await prisma.user.create({
        data: {
          email: testUser.email.toLowerCase(),
          passwordHash,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          isEmailVerified: true
        }
      });

      // Login to get first refresh token
      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      const { refreshToken } = loginRes.body;

      // First Refresh (valid rotation)
      await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      // Second Refresh using same token (REPLAY ATTACK)
      const replayRes = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken });

      expect(replayRes.status).toBe(401);
      expect(replayRes.body.detail).toContain('revoked due to security compromise');

      // Assert that ALL sessions are now revoked
      const activeSessionsCount = await prisma.session.count({
        where: { userId: user.id, revokedTimestamp: null }
      });
      expect(activeSessionsCount).toBe(0);
    });
  });

  describe('POST /auth/logout', () => {
    it('should log out user from current session (revoke token)', async () => {
      const passwordHash = await hashPassword(testUser.password);
      await prisma.user.create({
        data: {
          email: testUser.email.toLowerCase(),
          passwordHash,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          isEmailVerified: true
        }
      });

      const loginRes = await request(app)
        .post('/auth/login')
        .send({ email: testUser.email, password: testUser.password });

      const { accessToken } = loginRes.body;

      const logoutRes = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .send();

      expect(logoutRes.status).toBe(204);

      // Try calling /auth/me now, should fail
      const meRes = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(meRes.status).toBe(401);
    });
  });

  describe('Password Reset Flow', () => {
    it('should generate password reset token silently (generic response) and allow reset', async () => {
      const passwordHash = await hashPassword(testUser.password);
      const user = await prisma.user.create({
        data: {
          email: testUser.email.toLowerCase(),
          passwordHash,
          firstName: testUser.firstName,
          lastName: testUser.lastName,
          isEmailVerified: true
        }
      });

      // 1. Request Reset
      const forgotRes = await request(app)
        .post('/auth/forgot-password')
        .send({ email: testUser.email });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.message).toContain('instructions');

      const resetRecord = await prisma.passwordResetToken.findFirst({
        where: { userId: user.id }
      });
      expect(resetRecord).toBeTruthy();

      const rawResetToken = 'resettokenabcdef123456';
      const resetHash = hashToken(rawResetToken);
      
      await prisma.passwordResetToken.update({
        where: { id: resetRecord.id },
        data: { tokenHash: resetHash }
      });

      // 2. Perform Reset
      const newPassword = 'NewSecretPassword999!';
      const resetRes = await request(app)
        .post('/auth/reset-password')
        .send({
          token: rawResetToken,
          password: newPassword
        });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.message).toContain('successfully');

      // Verify token marked consumed
      const updatedReset = await prisma.passwordResetToken.findUnique({
        where: { id: resetRecord.id }
      });
      expect(updatedReset.consumedAt).toBeTruthy();

      // Verify credentials update
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      const canLoginWithOld = await comparePassword(testUser.password, updatedUser.passwordHash);
      expect(canLoginWithOld).toBe(false);

      const canLoginWithNew = await comparePassword(newPassword, updatedUser.passwordHash);
      expect(canLoginWithNew).toBe(true);
    });
  });
});
