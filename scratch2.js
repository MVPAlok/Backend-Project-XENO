import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  await prisma.user.updateMany({
    where: { email: 'aayanpandey8528@gmail.com' },
    data: { isEmailVerified: true, emailVerificationToken: null, emailVerificationExpiry: null }
  });
  console.log("Verified aayanpandey8528@gmail.com!");
}
main().catch(console.error).finally(() => prisma.$disconnect());
