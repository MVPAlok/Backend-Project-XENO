import { vi, beforeEach, afterAll } from 'vitest';
import prisma from '../src/config/database.js';

// Mock supertest to automatically prefix endpoints with /api/v1 if not present
vi.mock('supertest', async (importOriginal) => {
  const original = await importOriginal();
  
  const handler = {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head', 'del'];
      if (methods.includes(prop) && typeof value === 'function') {
        return function (url, ...args) {
          let targetUrl = url;
          if (typeof url === 'string' && !url.startsWith('/api/v1')) {
            targetUrl = `/api/v1${url.startsWith('/') ? '' : '/'}${url}`;
          }
          return value.call(target, targetUrl, ...args);
        };
      }
      return value;
    }
  };

  const mockSupertest = (app) => {
    const agent = original.default(app);
    return new Proxy(agent, handler);
  };

  mockSupertest.agent = (app) => {
    const agent = original.agent(app);
    return new Proxy(agent, handler);
  };

  return {
    default: mockSupertest,
    agent: mockSupertest.agent
  };
});

// Mock nodemailer SMTP client during test executions
vi.mock('nodemailer', () => {
  return {
    default: {
      createTransport: vi.fn().mockReturnValue({
        verify: vi.fn().mockImplementation((cb) => cb(null)),
        sendMail: vi.fn().mockResolvedValue({ messageId: 'mocked-email-uuid' })
      })
    },
    transporter: {
      verify: vi.fn().mockImplementation((cb) => cb(null)),
      sendMail: vi.fn().mockResolvedValue({ messageId: 'mocked-email-uuid' })
    }
  };
});

// Clean the DB before each test to maintain test independence
beforeEach(async () => {
  try {
    // Ordering deletions to satisfy Postgres foreign key references
    await prisma.$transaction([
      prisma.order.deleteMany(),
      prisma.customer.deleteMany(),
      prisma.importJob.deleteMany(),
      prisma.workspaceMember.deleteMany(),
      prisma.workspace.deleteMany(),
      prisma.user.deleteMany()
    ]);
  } catch (err) {
    console.error('Failed to clean database during tests setup:', err);
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});
