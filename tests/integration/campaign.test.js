import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../src/app.js';
import prisma from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/crypto.js';

describe('Campaigns and Analytics Integration Tests', () => {
  let user1Token;
  let user2Token;
  let user1;
  let user2;
  let workspace1;
  let workspace2;
  let segment1;

  beforeEach(async () => {
    // Clean database dependencies safely
    await prisma.campaign.deleteMany({});
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

    // Login to acquire Bearer tokens
    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'user1@xeno.com', password: 'Password123!' });
    user1Token = login1.body.accessToken;

    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: 'user2@xeno.com', password: 'Password123!' });
    user2Token = login2.body.accessToken;

    // Create Workspaces
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

    // Create a Segment rule to associate with campaigns
    segment1 = await prisma.segment.create({
      data: {
        workspaceId: workspace1.id,
        name: 'Mumbai Shoppers',
        createdBy: user1.id,
        rules: {
          create: [
            { field: 'city', operator: '=', value: JSON.stringify('Mumbai') }
          ]
        }
      }
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Campaign routes', () => {
    it('should create a DRAFT campaign successfully (201)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/campaigns`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Summer Promo 2026',
          segmentId: segment1.id,
          channel: 'EMAIL',
          messageSubject: 'Warm Summer Deals',
          messageBody: 'Hello Mumbai! Enjoy 20% off.',
          status: 'DRAFT'
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Summer Promo 2026');
      expect(res.body.status).toBe('DRAFT');
      expect(res.body.sentCount).toBeNull();
      expect(res.body.openRate).toBeUndefined();
    });

    it('should calculate metrics when campaign status is SENT', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/campaigns`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Flash SMS Blast',
          segmentId: segment1.id,
          channel: 'SMS',
          messageBody: 'Quick 2-hour sale! Click: xeno.co/flash',
          status: 'SENT'
        });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Flash SMS Blast');
      expect(res.body.status).toBe('SENT');
      expect(res.body.sentCount).toBe(0); // no customers seeded in database matching Mumbai yet
      expect(res.body.openRate).toBe(0);
      expect(res.body.clickRate).toBe(0);
      expect(res.body.conversionRate).toBe(0);
    });

    it('should list all workspace campaigns (200)', async () => {
      await prisma.campaign.create({
        data: {
          workspaceId: workspace1.id,
          segmentId: segment1.id,
          name: 'Historical WhatsApp campaign',
          channel: 'WHATSAPP',
          messageBody: 'Quick promo body',
          status: 'DRAFT'
        }
      });

      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/campaigns`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].name).toBe('Historical WhatsApp campaign');
    });

    it('should isolate workspace campaigns from non-members (403)', async () => {
      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/campaigns`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Analytics routes', () => {
    it('should fetch campaign funnel steps (200)', async () => {
      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/analytics/funnel`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body[0].name).toBe('Sent');
      expect(res.body[0].percentage).toBe(100);
    });

    it('should fetch workspace CRM insights (200)', async () => {
      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/analytics/insights`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toBeInstanceOf(Array);
      expect(res.body.length).toBe(3);
      expect(res.body[0].title).toBe('High-Value Shopper Churn Alert');
      expect(res.body[1].title).toBe('Discount Sensitivity Opportunity');
    });

    it('should fetch workspace dashboard metrics and activities (200)', async () => {
      const res = await request(app)
        .get(`/workspaces/${workspace1.id}/analytics/dashboard`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('metrics');
      expect(res.body.metrics).toHaveProperty('totalShoppers');
      expect(res.body.metrics).toHaveProperty('gmv');
      expect(res.body.metrics).toHaveProperty('activeCampaigns');
      expect(res.body.metrics).toHaveProperty('avgRecencyDays');
      expect(res.body).toHaveProperty('activities');
      expect(res.body.activities).toBeInstanceOf(Array);
    });
  });
});
