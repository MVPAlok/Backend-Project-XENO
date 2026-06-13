import { vi, beforeEach, afterAll } from 'vitest';
import prisma from '../src/config/database.js';

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
