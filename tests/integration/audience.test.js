import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../src/app.js';
import prisma from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/crypto.js';

describe('Audience Intelligence Integration Tests', () => {
  let user1Token;
  let user2Token;
  let user1;
  let user2;
  let workspace1;
  let workspace2;

  beforeEach(async () => {
    // Clean database
    await prisma.segmentRule.deleteMany({});
    await prisma.segment.deleteMany({});
    await prisma.order.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.workspaceMember.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});

    // Setup users
    const passwordHash = await hashPassword('Password123!');
    user1 = await prisma.user.create({
      data: {
        email: 'user1@xeno.com',
        passwordHash,
        firstName: 'Alice',
        lastName: 'Developer',
        isEmailVerified: true
      }
    });

    user2 = await prisma.user.create({
      data: {
        email: 'user2@xeno.com',
        passwordHash,
        firstName: 'Bob',
        lastName: 'Manager',
        isEmailVerified: true
      }
    });

    // Login
    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'user1@xeno.com', password: 'Password123!' });
    user1Token = login1.body.accessToken;

    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: 'user2@xeno.com', password: 'Password123!' });
    user2Token = login2.body.accessToken;

    // Workspaces
    workspace1 = await prisma.workspace.create({
      data: {
        name: 'Workspace One',
        slug: 'workspace-one',
        memberships: {
          create: {
            userId: user1.id,
            role: 'OWNER'
          }
        }
      }
    });

    workspace2 = await prisma.workspace.create({
      data: {
        name: 'Workspace Two',
        slug: 'workspace-two',
        memberships: {
          create: {
            userId: user2.id,
            role: 'OWNER'
          }
        }
      }
    });

    // Seed Workspace 1 Customers and Orders
    // Customer 1: John Doe (Mumbai, totalSpend = 7000, count = 2, category: skincare, last purchase = 5 days ago)
    const john = await prisma.customer.create({
      data: {
        workspaceId: workspace1.id,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@mumbai.com',
        city: 'Mumbai'
      }
    });

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    await prisma.order.create({
      data: {
        workspaceId: workspace1.id,
        customerId: john.id,
        externalOrderId: 'ORD-J1',
        amount: 3000.00,
        purchaseDate: tenDaysAgo,
        category: 'skincare',
        discountUsage: false
      }
    });

    await prisma.order.create({
      data: {
        workspaceId: workspace1.id,
        customerId: john.id,
        externalOrderId: 'ORD-J2',
        amount: 4000.00,
        purchaseDate: fiveDaysAgo,
        category: 'skincare',
        discountUsage: true
      }
    });

    // Customer 2: Jane Smith (Bangalore, totalSpend = 1000, count = 1, category: electronics, last purchase = 50 days ago)
    const jane = await prisma.customer.create({
      data: {
        workspaceId: workspace1.id,
        firstName: 'Jane',
        lastName: 'Smith',
        email: 'jane@bangalore.com',
        city: 'Bangalore'
      }
    });

    const fiftyDaysAgo = new Date();
    fiftyDaysAgo.setDate(fiftyDaysAgo.getDate() - 50);

    await prisma.order.create({
      data: {
        workspaceId: workspace1.id,
        customerId: jane.id,
        externalOrderId: 'ORD-JS1',
        amount: 1000.00,
        purchaseDate: fiftyDaysAgo,
        category: 'electronics',
        discountUsage: false
      }
    });

    // Seed Workspace 2 (Isolation Check)
    // Customer 3: Bob in Mumbai, but belongs to workspace 2
    const bob = await prisma.customer.create({
      data: {
        workspaceId: workspace2.id,
        firstName: 'Bob',
        lastName: 'Isolation',
        email: 'bob@mumbai.com',
        city: 'Mumbai'
      }
    });

    await prisma.order.create({
      data: {
        workspaceId: workspace2.id,
        customerId: bob.id,
        externalOrderId: 'ORD-ISO1',
        amount: 8000.00,
        purchaseDate: fiveDaysAgo,
        category: 'skincare'
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Audience Generator Endpoint POST /workspaces/:workspaceId/audiences/generate', () => {
    it('should reject unauthorized access (401)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .send({ prompt: 'Bring back loyal customers.' });
      expect(res.status).toBe(401);
    });

    it('should reject non-member user access (403)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ prompt: 'Bring back loyal customers.' });
      expect(res.status).toBe(403);
    });

    it('should generate audience preview from predefined goals', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ prompt: 'Reward loyal customers' });

      expect(res.status).toBe(200);
      expect(res.body.segmentName).toBe('Loyal Customers');
      expect(res.body.rules).toBeInstanceOf(Array);
      expect(res.body.count).toBe(0); // john has 2 orders, jane has 1 order, so count is 0 (loyal is >= 5 orders)
      expect(res.body.previewCustomers).toEqual([]);
      expect(res.body.aiSummary).toContain('0 loyal customers');
    });

    it('should generate audience preview from free-form conversational prompt', async () => {
      // Prompt: "Find customers from Mumbai who purchased skincare products but have not purchased in the last 45 days."
      // Let's customize it: Mumbai, skincare, 45 days is john who purchased 5 days ago (so john shouldn't match). Count = 0.
      // But if we prompt "Find customers from Mumbai who purchased skincare", john has Mumbai & skincare. Last purchase 5 days ago.
      // Let's query: "Find customers from Mumbai who purchased skincare"
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ prompt: 'Find customers from Mumbai who purchased skincare' });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1); // john matches (workspace 1). Bob (workspace 2) does not! (isolation verified)
      expect(res.body.previewCustomers.length).toBe(1);
      expect(res.body.previewCustomers[0].name).toBe('John Doe');
      expect(res.body.previewCustomers[0].city).toBe('Mumbai');
      expect(res.body.previewCustomers[0].totalSpend).toBe(7000);
      expect(res.body.previewCustomers[0].orderCount).toBe(2);
      expect(res.body.aiSummary).toContain('Mumbai');
    });

    it('should reject prompts leading to invalid JSON responses (400)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ prompt: 'trigger_invalid_json' });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('AI response');
    });

    it('should reject invalid rule operators returned by LLM (400)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ prompt: 'trigger_invalid_operator' });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('validation failed');
    });

    it('should reject unsupported rule fields returned by LLM (400)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ prompt: 'trigger_invalid_field' });

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('validation failed');
    });

    it('should enforce rate limits on LLM endpoints (429)', async () => {
      // Send 6 requests in rapid succession.
      // We pass the special header x-test-rate-limit to enable rate limit check in tests.
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/workspaces/${workspace1.id}/audiences/generate`)
          .set('Authorization', `Bearer ${user1Token}`)
          .set('x-test-rate-limit', 'true')
          .send({ prompt: 'Reward loyal customers' });
      }

      const rateLimitRes = await request(app)
        .post(`/workspaces/${workspace1.id}/audiences/generate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .set('x-test-rate-limit', 'true')
        .send({ prompt: 'Reward loyal customers' });

      expect(rateLimitRes.status).toBe(429);
      expect(rateLimitRes.body.title).toBe('Too Many Requests');
    });
  });

  describe('Segment CRUD and Previews', () => {
    let savedSegment;

    beforeEach(async () => {
      // Pre-create segment for details/list test
      savedSegment = await prisma.segment.create({
        data: {
          workspaceId: workspace1.id,
          name: 'Dormant High Value',
          description: 'High spenders who went inactive',
          createdBy: user1.id,
          rules: {
            create: [
              { field: 'totalSpend', operator: '>', value: JSON.stringify(5000) },
              { field: 'lastPurchaseDays', operator: '>=', value: JSON.stringify(180) }
            ]
          }
        },
        include: { rules: true }
      });
    });

    it('should persist new segment successfully (201)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/segments`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Skincare Lovers Mumbai',
          description: 'Mumbai customers buying skincare',
          rules: [
            { field: 'city', operator: '=', value: 'Mumbai' },
            { field: 'category', operator: '=', value: 'skincare' }
          ]
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBe('Skincare Lovers Mumbai');
      expect(res.body.rules.length).toBe(2);

      // Verify in DB
      const dbSegment = await prisma.segment.findUnique({
        where: { id: res.body.id },
        include: { rules: true }
      });
      expect(dbSegment).toBeTruthy();
      expect(dbSegment.rules.length).toBe(2);
    });

    it('should list saved segments for workspace (200)', async () => {
      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/segments`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Dormant High Value');
    });

    it('should retrieve segment details by ID (200)', async () => {
      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/segments/${savedSegment.id}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Dormant High Value');
      expect(res.body.rules.length).toBe(2);
      expect(res.body.rules[0].value).toBe(5000);
    });

    it('should preview saved segment customers (200)', async () => {
      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/segments/${savedSegment.id}/preview`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0); // none has recency >= 180 days (seeded orders are 5 and 50 days ago)
      expect(res.body.sampleCustomers).toEqual([]);
    });

    it('should enforce workspace isolation on segment retrieval (404)', async () => {
      // User 2 trying to get segment from Workspace 1 using Workspace 2 context
      const res = await request(app)
        .get(`/workspaces/${workspace2.id}/segments/${savedSegment.id}`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(404);
    });
  });
});
