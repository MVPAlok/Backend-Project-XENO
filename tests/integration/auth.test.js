import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../src/app.js';
import prisma from '../../src/config/database.js';
import { hashPassword, hashToken, comparePassword } from '../../src/utils/crypto.js';

beforeEach(async () => {
  await prisma.user.deleteMany({});
});

afterAll(async () => {
  await prisma.$disconnect();
});

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

      expect(user.emailVerificationToken).toBeTruthy();
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
      
      // Let's create a known token hash in database so we can test with its raw value
      const rawToken = 'abcdef1234567890abcdef1234567890';
      const tokenHash = hashToken(rawToken);
      
      await prisma.user.update({
        where: { id: user.id },
        data: { emailVerificationToken: tokenHash }
      });

      const res = await request(app)
        .get(`/auth/verify-email?token=${rawToken}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('verified successfully');

      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser.isEmailVerified).toBe(true);

      expect(updatedUser.emailVerificationToken).toBeNull();
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

      const loggedInUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(loggedInUser.refreshTokenHash).toBeTruthy();
      expect(loggedInUser.sessionExpiry).toBeTruthy();
    });
  });

  describe('POST /auth/refresh', () => {
    it('should successfully rotate tokens', async () => {
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
    });

    it('should detect replay attack and revoke active session on token reuse', async () => {
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

      // Assert that session is revoked
      const compromisedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(compromisedUser.refreshTokenHash).toBeNull();
      expect(compromisedUser.sessionExpiry).toBeNull();
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

      const rawResetToken = 'resettokenabcdef123456';
      const resetHash = hashToken(rawResetToken);
      
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: resetHash }
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
      const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
      expect(updatedUser.passwordResetToken).toBeNull();

      // Verify credentials update
      const canLoginWithOld = await comparePassword(testUser.password, updatedUser.passwordHash);
      expect(canLoginWithOld).toBe(false);

      const canLoginWithNew = await comparePassword(newPassword, updatedUser.passwordHash);
      expect(canLoginWithNew).toBe(true);
    });
  });
});
