import * as argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({ where: { email: 'author@nextstep2.dev' } });
  console.log('User hash:', user?.passwordHash);
  const newHash = await argon2.hash('password', { type: argon2.argon2id });
  await prisma.user.updateMany({
    where: { email: { in: ['admin@nextstep2.dev', 'author@nextstep2.dev', 'reviewer@nextstep2.dev', 'jordan.smith@nextstep2.dev'] } },
    data: { passwordHash: newHash }
  });
  console.log('Password reset to "password" for all users');
}
main().finally(() => prisma.$disconnect());
