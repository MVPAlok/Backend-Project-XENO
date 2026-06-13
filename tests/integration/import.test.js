import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../src/app.js';
import prisma from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/crypto.js';

describe('Imports API Integration Tests', () => {
  let user1Token;
  let user2Token;
  let user1;
  let user2;
  let workspace1;
  let workspace2;

  beforeEach(async () => {
    // Clean DB
    await prisma.order.deleteMany({});
    await prisma.customer.deleteMany({});
    await prisma.importJob.deleteMany({});
    await prisma.workspaceMember.deleteMany({});
    await prisma.workspace.deleteMany({});
    await prisma.user.deleteMany({});

    // Setup users
    const passwordHash = await hashPassword('Password123!');
    user1 = await prisma.user.create({
      data: {
        email: 'u1@xeno.com',
        passwordHash,
        firstName: 'U',
        lastName: 'One',
        isEmailVerified: true
      }
    });

    user2 = await prisma.user.create({
      data: {
        email: 'u2@xeno.com',
        passwordHash,
        firstName: 'U',
        lastName: 'Two',
        isEmailVerified: true
      }
    });

    // Login users
    const login1 = await request(app)
      .post('/auth/login')
      .send({ email: 'u1@xeno.com', password: 'Password123!' });
    user1Token = login1.body.accessToken;

    const login2 = await request(app)
      .post('/auth/login')
      .send({ email: 'u2@xeno.com', password: 'Password123!' });
    user2Token = login2.body.accessToken;

    // Create workspaces
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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('CSV File Validation and Upload Controls', () => {
    it('should reject upload if token is missing (401)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .attach('file', Buffer.from('firstName,email\nJohn,john@gmail.com'), 'test.csv');
      expect(res.status).toBe(401);
    });

    it('should reject upload if user is not member of workspace (403)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .set('Authorization', `Bearer ${user2Token}`)
        .attach('file', Buffer.from('firstName,email\nJohn,john@gmail.com'), 'test.csv');
      expect(res.status).toBe(403);
    });

    it('should reject non-CSV files', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('{"name":"john"}'), 'test.json');
      
      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('CSV');
    });

    it('should reject files exceeding 10MB', async () => {
      // Create a buffer larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', largeBuffer, 'large.csv');

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('exceeds 10 MB');
    });
  });

  describe('Customer Ingestion Flow', () => {
    it('should successfully ingest customers, update counters, and auto-upsert duplicates', async () => {
      const csvData = [
        'firstName,lastName,email,phone,gender,dateOfBirth,externalId',
        'Nike,Consumer,nike@buyer.com,+91 99999 99999,male,1990-05-15,EXT1',
        'Adidas,Buyer,adidas@buyer.com,,female,,EXT2',
        'InvalidRow,,,,,,' // missing email OR phone - should fail
      ].join('\n');

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from(csvData), 'customers.csv');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.totalRows).toBe(3);
      expect(res.body.processedRows).toBe(3);
      expect(res.body.successfulRows).toBe(2);
      expect(res.body.failedRows).toBe(1);

      // Verify in DB
      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      expect(customers.length).toBe(2);

      const nike = customers.find(c => c.email === 'nike@buyer.com');
      expect(nike).toBeTruthy();
      expect(nike.firstName).toBe('Nike');
      expect(nike.phone).toBe('919999999999'); // cleaned phone
      expect(nike.gender).toBe('MALE');
      expect(nike.externalId).toBe('EXT1');
    });

    it('should perform duplicate upsert and fill in missing/null fields', async () => {
      // Pre-create customer with empty lastName and dob
      await prisma.customer.create({
        data: {
          workspaceId: workspace1.id,
          firstName: 'PreExisting',
          lastName: null,
          email: 'dup@xeno.com',
          phone: null
        }
      });

      const csvData = [
        'firstName,lastName,email,phone,gender,dateOfBirth',
        'UpdatedName,AddedLastName,dup@xeno.com,+91 88888 88888,female,1995-10-10'
      ].join('\n');

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from(csvData), 'customers.csv');

      expect(res.status).toBe(200);
      expect(res.body.successfulRows).toBe(1);

      // Check DB
      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      expect(customers.length).toBe(1); // No duplicates created

      const customer = customers[0];
      expect(customer.firstName).toBe('PreExisting'); // Do not overwrite existing firstName
      expect(customer.lastName).toBe('AddedLastName'); // Fill in missing lastName
      expect(customer.phone).toBe('918888888888'); // Fill in missing phone
      expect(customer.gender).toBe('FEMALE'); // Fill in missing gender
    });
  });

  describe('Order Ingestion Flow', () => {
    let customer1;

    beforeEach(async () => {
      // Create a customer to link orders to
      customer1 = await prisma.customer.create({
        data: {
          workspaceId: workspace1.id,
          firstName: 'John',
          email: 'john@order.com',
          phone: '917777777777'
        }
      });
    });

    it('should successfully ingest orders, link to customer, and prevent duplicates with externalOrderId', async () => {
      const csvData = [
        'customerEmail,customerPhone,amount,purchaseDate,externalOrderId,currency',
        'john@order.com,,1500.50,2026-06-01T12:00:00Z,ORD100,INR',
        ',917777777777,2500.00,2026-06-02,ORD100,INR', // Duplicate ORD100 - should be ignored
        'john@order.com,,999.00,2026-06-03,,INR', // No external ID - should always be created
        'nonexistent@user.com,,500,2026-06-01,,USD' // Non-existent customer - should fail
      ].join('\n');

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/orders`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from(csvData), 'orders.csv');

      expect(res.status).toBe(200);
      expect(res.body.totalRows).toBe(4);
      expect(res.body.successfulRows).toBe(3); // ORD100 created, ORD100 duplicate ignored (successful but skipped), No external ID created.
      expect(res.body.failedRows).toBe(1); // nonexistent customer failed

      // Verify DB orders
      const orders = await prisma.order.findMany({ where: { workspaceId: workspace1.id } });
      expect(orders.length).toBe(2); // Only 2 orders persisted (ORD100 and the one with no externalOrderId)

      const ord1 = orders.find(o => o.externalOrderId === 'ORD100');
      expect(ord1).toBeTruthy();
      expect(Number(ord1.amount)).toBe(1500.50);
      expect(ord1.customerId).toBe(customer1.id);

      const ord2 = orders.find(o => o.externalOrderId === null);
      expect(ord2).toBeTruthy();
      expect(Number(ord2.amount)).toBe(999.00);
    });
  });

  describe('Workspace Isolation', () => {
    it('should enforce strict tenant data isolation', async () => {
      // Ingest customer to Workspace 1
      await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('firstName,email\nWorkspace1Customer,w1@xeno.com'), 'w1.csv');

      // Attempt to link order to w1@xeno.com in Workspace 2 - should fail linking (customer not found)
      const res = await request(app)
        .post(`/workspaces/${workspace2.id}/imports/orders`)
        .set('Authorization', `Bearer ${user2Token}`)
        .attach('file', Buffer.from('customerEmail,amount,purchaseDate\nw1@xeno.com,500,2026-06-01'), 'w2.csv');

      expect(res.body.failedRows).toBe(1);
      expect(res.body.successfulRows).toBe(0);

      // Verify no orders in Workspace 2
      const ordersW2 = await prisma.order.findMany({ where: { workspaceId: workspace2.id } });
      expect(ordersW2.length).toBe(0);
    });
  });

  describe('History and Details Retrieval', () => {
    it('should fetch import history and details correctly', async () => {
      // Trigger import
      const uploadRes = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/customers`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('firstName,email\nJohn,john@gmail.com'), 'history.csv');

      const jobId = uploadRes.body.id;

      // GET History
      const historyRes = await request(app)
        .get(`/workspaces/${workspace1.id}/imports`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.length).toBe(1);
      expect(historyRes.body[0].id).toBe(jobId);
      expect(historyRes.body[0].type).toBe('CUSTOMER');

      // GET Details
      const detailRes = await request(app)
        .get(`/workspaces/${workspace1.id}/imports/${jobId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(jobId);
      expect(detailRes.body.fileName).toBe('history.csv');
    });
  });
});
