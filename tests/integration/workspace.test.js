import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../src/app.js';
import prisma from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/crypto.js';

describe('Workspace API Integration Tests', () => {
  let user1Token;
  let user2Token;
  let user1;
  let user2;

  beforeEach(async () => {
    // DB clean is handled by tests/setup.js, but let's make sure it's clear
    await prisma.workspaceMember.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});

    // Create test user 1
    const passwordHash = await hashPassword('Password123!');
    user1 = await prisma.user.create({
      data: {
        email: 'user1@xeno.com',
        passwordHash,
        firstName: 'User',
        lastName: 'One',
        isEmailVerified: true
      }
    });

    // Create test user 2
    user2 = await prisma.user.create({
      data: {
        email: 'user2@xeno.com',
        passwordHash,
        firstName: 'User',
        lastName: 'Two',
        isEmailVerified: true
      }
    });

    // Log in user 1
    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'user1@xeno.com', password: 'Password123!' });
    user1Token = login1.body.accessToken;

    // Log in user 2
    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: 'user2@xeno.com', password: 'Password123!' });
    user2Token = login2.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /workspaces', () => {
    it('should require authentication', async () => {
      const res = await request(app)
        .post('/workspaces')
        .send({ name: 'Nike India' });
      expect(res.status).toBe(401);
    });

    it('should validate request body rules (name >= 3 characters)', async () => {
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'No' });
      
      expect(res.status).toBe(400);
      expect(res.body.title).toContain('Validation Error');
      expect(res.body.errors[0].field).toBe('name');
    });

    it('should successfully create workspace, assign OWNER role, and auto-generate unique slug', async () => {
      const res = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Nike India', description: 'Sports Wear' });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe('Nike India');
      expect(res.body.slug).toBe('nike-india');
      expect(res.body.role).toBe('OWNER');
      expect(res.body.description).toBe('Sports Wear');

      // Verify in DB
      const member = await prisma.workspaceMember.findFirst({
        where: { workspaceId: res.body.id, userId: user1.id }
      });
      expect(member).toBeTruthy();
      expect(member.role).toBe('OWNER');
    });

    it('should handle slug collisions sequentially', async () => {
      const res1 = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Starbucks India' });

      const res2 = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Starbucks India' });

      const res3 = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ name: 'Starbucks India' });

      expect(res1.status).toBe(201);
      expect(res1.body.slug).toBe('starbucks-india');

      expect(res2.status).toBe(201);
      expect(res2.body.slug).toBe('starbucks-india-2');

      expect(res3.status).toBe(201);
      expect(res3.body.slug).toBe('starbucks-india-3');
    });
  });

  describe('GET /workspaces', () => {
    it('should list only workspaces where user has membership', async () => {
      // User 1 creates a workspace
      await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Nike India' });

      // User 2 creates a workspace
      await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ name: 'Adidas India' });

      const res1 = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res1.status).toBe(200);
      expect(res1.body.length).toBe(1);
      expect(res1.body[0].name).toBe('Nike India');
      expect(res1.body[0].role).toBe('OWNER');
      expect(res1.body[0]).toHaveProperty('id');
      expect(res1.body[0]).toHaveProperty('slug');

      const res2 = await request(app)
        .get('/workspaces')
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res2.status).toBe(200);
      expect(res2.body.length).toBe(1);
      expect(res2.body[0].name).toBe('Adidas India');
    });
  });

  describe('GET /workspaces/:workspaceId', () => {
    it('should return 400 validation error for invalid UUID parameters', async () => {
      const res = await request(app)
        .get('/workspaces/invalid-uuid')
        .set('Authorization', `Bearer ${user1Token}`);
      
      expect(res.status).toBe(400);
      expect(res.body.title).toContain('Validation Error');
    });

    it('should return 404 if workspace does not exist', async () => {
      const randomUuid = '00000000-0000-0000-0000-000000000000';
      const res = await request(app)
        .get(`/workspaces/${randomUuid}`)
        .set('Authorization', `Bearer ${user1Token}`);
      
      expect(res.status).toBe(404);
      expect(res.body.title).toBe('Not Found');
    });

    it('should retrieve workspace details if the user is a member', async () => {
      const createRes = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Nike India', description: 'Sports Wear' });

      const res = await request(app)
        .get(`/workspaces/${createRes.body.id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.name).toBe('Nike India');
      expect(res.body.description).toBe('Sports Wear');
    });

    it('should return 403 if the user is not a member of the workspace', async () => {
      const createRes = await request(app)
        .post('/workspaces')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ name: 'Nike India' });

      const res = await request(app)
        .get(`/workspaces/${createRes.body.id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
      expect(res.body.title).toBe('Forbidden');
    });
  });

  describe('Database unique membership constraint', () => {
    it('should fail with unique constraint when inserting duplicate membership', async () => {
      const workspace = await prisma.workspace.create({
        data: {
          name: 'Unique DB Test',
          slug: 'unique-db-test'
        }
      });

      // Insert first membership
      await prisma.workspaceMember.create({
        data: {
          userId: user1.id,
          workspaceId: workspace.id,
          role: 'MEMBER'
        }
      });

      // Try inserting second membership for same user/workspace - should reject
      await expect(
        prisma.workspaceMember.create({
          data: {
            userId: user1.id,
            workspaceId: workspace.id,
            role: 'ADMIN'
          }
        })
      ).rejects.toThrow();
    });
  });
});
