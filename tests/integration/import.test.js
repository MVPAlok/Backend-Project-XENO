import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import app from '../../src/app.js';
import prisma from '../../src/config/database.js';
import { hashPassword } from '../../src/utils/crypto.js';

describe('Imports API Integration Tests (Phase 3 Redesign)', () => {
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
    it('should reject preview upload if token is missing (401)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .attach('file', Buffer.from('first_name,email\nJohn,john@gmail.com'), 'test.csv');
      expect(res.status).toBe(401);
    });

    it('should reject preview upload if user is not member of workspace (403)', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user2Token}`)
        .attach('file', Buffer.from('first_name,email\nJohn,john@gmail.com'), 'test.csv');
      expect(res.status).toBe(403);
    });

    it('should reject non-CSV files', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('{"name":"john"}'), 'test.json');
      
      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('CSV');
    });

    it('should reject files exceeding 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024, 'a');
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', largeBuffer, 'large.csv');

      expect(res.status).toBe(400);
      expect(res.body.detail).toContain('exceeds 10 MB');
    });
  });

  describe('Ingestion Preview Phase (No Persistence)', () => {
    it('should correctly generate import preview with AI mapping suggestions, status, and sample records without persisting', async () => {
      const csvData = [
        'first_name,last_name,email,phone,gender,date_of_birth,external_customer_id,external_order_id,amount,currency,order_date',
        'Nike,Consumer,nike@buyer.com,+91 99999 99999,male,1990-05-15,EXT1,ORD100,1500.50,INR,2026-06-01T12:00:00Z',
        'Adidas,Buyer,adidas@buyer.com,,female,,EXT2,ORD200,2500.00,INR,2026-06-02T12:00:00Z',
        'InvalidRow,,,,,,' // invalid row, missing email/phone
      ].join('\n');

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from(csvData), 'sales.csv');

      expect(res.status).toBe(200);
      expect(res.body.importJobId).toBeTruthy();
      expect(res.body.summary.totalRows).toBe(3);
      expect(res.body.summary.validRows).toBe(2);
      expect(res.body.summary.invalidRows).toBe(1);
      expect(res.body.suggestedStrategy).toBe('KEEP_EXISTING');
      expect(res.body.detectedMappings.first_name).toBe('firstName');
      expect(res.body.detectedMappings.amount).toBe('amount');

      // Verify no records are persisted in customers or orders tables
      const dbCustomers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      const dbOrders = await prisma.order.findMany({ where: { workspaceId: workspace1.id } });
      expect(dbCustomers.length).toBe(0);
      expect(dbOrders.length).toBe(0);

      // Verify the import job status is PREVIEW_READY
      const job = await prisma.importJob.findUnique({ where: { id: res.body.importJobId } });
      expect(job.status).toBe('PREVIEW_READY');
    });
  });

  describe('Ingestion Confirmation Phase (Conflict Resolution & Overrides)', () => {
    let previewRes;
    const mappings = {
      first_name: 'firstName',
      last_name: 'lastName',
      email: 'email',
      phone: 'phone',
      gender: 'gender',
      date_of_birth: 'dateOfBirth',
      external_customer_id: 'externalId',
      external_order_id: 'externalOrderId',
      amount: 'amount',
      currency: 'currency',
      order_date: 'purchaseDate'
    };

    const csvData = [
      'first_name,last_name,email,phone,gender,date_of_birth,external_customer_id,external_order_id,amount,currency,order_date',
      'Nike,Consumer,nike@buyer.com,+91 99999 99999,male,1990-05-15,EXT1,ORD100,1500.50,INR,2026-06-01T12:00:00Z',
      'Adidas,Buyer,adidas@buyer.com,,female,,EXT2,ORD200,2500.00,INR,2026-06-02T12:00:00Z'
    ].join('\n');

    beforeEach(async () => {
      previewRes = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from(csvData), 'sales.csv');
    });

    it('should persist new customers and orders successfully under KEEP_EXISTING global strategy', async () => {
      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/confirm`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          importJobId: previewRes.body.importJobId,
          mappings,
          resolutionStrategy: 'KEEP_EXISTING'
        });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.successfulRows).toBe(2);

      // Verify in DB
      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      const orders = await prisma.order.findMany({ where: { workspaceId: workspace1.id } });

      expect(customers.length).toBe(2);
      expect(orders.length).toBe(2);

      const nike = customers.find(c => c.email === 'nike@buyer.com');
      expect(nike.firstName).toBe('Nike');
      expect(nike.phone).toBe('919999999999');

      const ord1 = orders.find(o => o.externalOrderId === 'ORD100');
      expect(ord1.customerId).toBe(nike.id);
      expect(Number(ord1.amount)).toBe(1500.50);
    });

    it('should respect KEEP_EXISTING strategy and only update missing fields of pre-existing customer', async () => {
      // Pre-create customer with empty lastName and dob
      await prisma.customer.create({
        data: {
          workspaceId: workspace1.id,
          firstName: 'PreExisting',
          lastName: null,
          email: 'nike@buyer.com',
          phone: null
        }
      });

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/confirm`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          importJobId: previewRes.body.importJobId,
          mappings,
          resolutionStrategy: 'KEEP_EXISTING'
        });

      expect(res.status).toBe(200);

      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      const nike = customers.find(c => c.email === 'nike@buyer.com');
      expect(nike.firstName).toBe('PreExisting'); // kept existing firstname
      expect(nike.lastName).toBe('Consumer'); // filled in missing lastname
      expect(nike.phone).toBe('919999999999'); // filled in missing phone
    });

    it('should respect UPDATE_EXISTING strategy and overwrite pre-existing customer fields', async () => {
      // Pre-create customer
      await prisma.customer.create({
        data: {
          workspaceId: workspace1.id,
          firstName: 'PreExisting',
          lastName: 'OldLastName',
          email: 'nike@buyer.com',
          phone: '1111111'
        }
      });

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/confirm`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          importJobId: previewRes.body.importJobId,
          mappings,
          resolutionStrategy: 'UPDATE_EXISTING'
        });

      expect(res.status).toBe(200);

      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      const nike = customers.find(c => c.email === 'nike@buyer.com');
      expect(nike.firstName).toBe('Nike'); // Overwritten
      expect(nike.lastName).toBe('Consumer'); // Overwritten
      expect(nike.phone).toBe('919999999999'); // Overwritten
    });

    it('should respect SKIP strategy and ignore conflict rows entirely', async () => {
      // Pre-create customer
      await prisma.customer.create({
        data: {
          workspaceId: workspace1.id,
          firstName: 'PreExisting',
          lastName: 'OldLastName',
          email: 'nike@buyer.com'
        }
      });

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/confirm`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          importJobId: previewRes.body.importJobId,
          mappings,
          resolutionStrategy: 'SKIP'
        });

      expect(res.status).toBe(200);

      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      const orders = await prisma.order.findMany({ where: { workspaceId: workspace1.id } });

      const nike = customers.find(c => c.email === 'nike@buyer.com');
      expect(nike.firstName).toBe('PreExisting'); // Unchanged
      expect(nike.lastName).toBe('OldLastName'); // Unchanged

      // ORD100 order should not be created because row was skipped
      const ord1 = orders.find(o => o.externalOrderId === 'ORD100');
      expect(ord1).toBeUndefined();

      // Adidas order ORD200 should be created (as it did not conflict)
      const ord2 = orders.find(o => o.externalOrderId === 'ORD200');
      expect(ord2).toBeTruthy();
    });

    it('should apply record-level strategy overrides', async () => {
      // Pre-create customer
      await prisma.customer.create({
        data: {
          workspaceId: workspace1.id,
          firstName: 'PreExisting',
          lastName: 'OldLastName',
          email: 'nike@buyer.com'
        }
      });

      const res = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/confirm`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          importJobId: previewRes.body.importJobId,
          mappings,
          resolutionStrategy: 'KEEP_EXISTING', // global strategy
          overrides: [
            {
              identifier: 'nike@buyer.com',
              strategy: 'UPDATE_EXISTING' // per-record override
            }
          ]
        });

      expect(res.status).toBe(200);

      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      const nike = customers.find(c => c.email === 'nike@buyer.com');
      expect(nike.firstName).toBe('Nike'); // Overwritten because override was UPDATE_EXISTING
    });
  });

  describe('Workspace Isolation', () => {
    it('should enforce strict tenant data isolation in single export previews and confirmation', async () => {
      // Ingest preview in Workspace 1
      const previewRes = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('first_name,email,external_order_id,amount,order_date\nTenantCust,tenant@xeno.com,TEN100,500,2026-06-01'), 'tenant.csv');

      // Attempt to confirm import in Workspace 2 using Workspace 1's jobId - should return 404
      const confirmRes = await request(app)
        .post(`/workspaces/${workspace2.id}/imports/confirm`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({
          importJobId: previewRes.body.importJobId,
          mappings: { first_name: 'firstName', email: 'email', external_order_id: 'externalOrderId', amount: 'amount', order_date: 'purchaseDate' },
          resolutionStrategy: 'KEEP_EXISTING'
        });

      expect(confirmRes.status).toBe(404);

      // Verify no customers/orders were created in Workspace 2
      const customersW2 = await prisma.customer.findMany({ where: { workspaceId: workspace2.id } });
      expect(customersW2.length).toBe(0);
    });
  });

  describe('History and Details Retrieval', () => {
    it('should fetch import history and details with preview details correctly', async () => {
      const previewRes = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from('first_name,email\nJohn,john@gmail.com'), 'history.csv');

      const jobId = previewRes.body.importJobId;

      // GET History
      const historyRes = await request(app)
        .get(`/workspaces/${workspace1.id}/imports`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(historyRes.status).toBe(200);
      expect(historyRes.body.length).toBe(1);
      expect(historyRes.body[0].id).toBe(jobId);
      expect(historyRes.body[0].type).toBe('SALES_EXPORT');

      // GET Details
      const detailRes = await request(app)
        .get(`/workspaces/${workspace1.id}/imports/${jobId}`)
        .set('Authorization', `Bearer ${user1Token}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.id).toBe(jobId);
      expect(detailRes.body.fileName).toBe('history.csv');
      expect(detailRes.body.previewData).toBeTruthy();
    });
  });

  describe('Dirty Dataset Mapping, Cleaning, and Deduplication', () => {
    it('should correctly infer mappings, clean and split names, detect duplicates, and deduplicate during confirm', async () => {
      const csvData = [
        'Cust Name,Total Amt,Phone_Num,CustomerID,EmailAddress,PurchaseDate,external_order_id',
        'john doe,99.99,+1234567890,CUST1,john.doe@example.com,2026-06-13T10:00:00Z,ORD1001',
        'JANE  SMITH,149.50,+1987654321,CUST2,jane.smith@example.com,2026-06-13T11:30:00Z,ORD1002',
        'john doe,45.00,+1234567890,CUST1,john.doe@example.com,2026-06-13T12:00:00Z,ORD1003', // Duplicate CustomerID CUST1, different order
        'john doe,99.99,+1234567890,CUST1,john.doe@example.com,2026-06-13T10:00:00Z,ORD1001', // Exact match duplicate of Row 1
        'Invalid,null,null,CUST3,invalidemail,31/02/2023,ORD1004' // Invalid row
      ].join('\n');

      const previewRes = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/preview`)
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', Buffer.from(csvData), 'dirty_restaurant.csv');

      expect(previewRes.status).toBe(200);
      expect(previewRes.body.summary.totalRows).toBe(5);
      expect(previewRes.body.summary.validRows).toBe(4);
      expect(previewRes.body.summary.invalidRows).toBe(1);
      expect(previewRes.body.summary.potentialDuplicates).toBe(2); // 1 exact duplicate, 1 duplicate CustomerID CUST1

      // Mappings mapping checks
      expect(previewRes.body.detectedMappings['Cust Name']).toBe('firstName');
      expect(previewRes.body.detectedMappings['Total Amt']).toBe('amount');
      expect(previewRes.body.detectedMappings['Phone_Num']).toBe('phone');
      expect(previewRes.body.detectedMappings['CustomerID']).toBe('externalId');
      expect(previewRes.body.detectedMappings['EmailAddress']).toBe('email');
      expect(previewRes.body.detectedMappings['PurchaseDate']).toBe('purchaseDate');

      // Confirm ingestion
      const confirmRes = await request(app)
        .post(`/workspaces/${workspace1.id}/imports/confirm`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          importJobId: previewRes.body.importJobId,
          mappings: previewRes.body.detectedMappings,
          resolutionStrategy: 'KEEP_EXISTING'
        });

      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.status).toBe('COMPLETED');
      expect(confirmRes.body.processedRows).toBe(5);
      expect(confirmRes.body.successfulRows).toBe(4); // 4 valid rows processed

      // Verify DB persistence
      const customers = await prisma.customer.findMany({ where: { workspaceId: workspace1.id } });
      const orders = await prisma.order.findMany({ where: { workspaceId: workspace1.id } });

      // There should be exactly 2 unique valid customers created: John Doe, Jane Smith
      expect(customers.length).toBe(2);
      
      const john = customers.find(c => c.externalId === 'CUST1');
      expect(john).toBeTruthy();
      expect(john.firstName).toBe('John'); // Title cased
      expect(john.lastName).toBe('Doe'); // Split from "john doe" since lastName was not mapped
      expect(john.phone).toBe('1234567890');

      const jane = customers.find(c => c.externalId === 'CUST2');
      expect(jane).toBeTruthy();
      expect(jane.firstName).toBe('Jane');
      expect(jane.lastName).toBe('Smith'); // Split from "JANE  SMITH"

      // There should be exactly 3 orders created: ORD1001, ORD1002, ORD1003. (The exact duplicate ORD1001 is skipped/deduplicated)
      expect(orders.length).toBe(3);
      expect(orders.some(o => o.externalOrderId === 'ORD1001')).toBe(true);
      expect(orders.some(o => o.externalOrderId === 'ORD1002')).toBe(true);
      expect(orders.some(o => o.externalOrderId === 'ORD1003')).toBe(true);
      expect(orders.filter(o => o.externalOrderId === 'ORD1001').length).toBe(1); // exactly 1, not 2!
    });
  });
});
