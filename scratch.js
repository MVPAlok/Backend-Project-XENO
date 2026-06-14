import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, emailVerificationToken: true } });
  console.log("USERS:", JSON.stringify(users, null, 2));

  // The token from the log:
  const rawToken = "29045ea02d0cbc2ed930c95a099b1d64f09928edea7f5ea789509656c1d725bf";
  const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
  console.log("Raw:", rawToken);
  console.log("Hashed:", hashedToken);
}
main().catch(console.error).finally(() => prisma.$disconnect());
