import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

const prismaClientSingleton = () => {
  return new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
};

const globalForPrisma = globalThis;

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

export default prisma;

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
