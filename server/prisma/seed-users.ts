import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

async function upsertUser(email: string, password: string, name: string, role: 'ADMIN' | 'CONTENT_AUTHOR' | 'CONTENT_REVIEWER' | 'STUDENT') {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { email, passwordHash, name, role },
  });
}

async function main() {
  console.log('Seeding accounts...');
  const admin = await upsertUser(
    process.env.SEED_ADMIN_EMAIL ?? 'admin@nextstep2.dev',
    process.env.SEED_ADMIN_PASSWORD ?? 'password',
    'Admin User',
    'ADMIN',
  );
  const contentAuthor = await upsertUser(
    process.env.SEED_CONTENT_AUTHOR_EMAIL ?? 'author@nextstep2.dev',
    process.env.SEED_CONTENT_AUTHOR_PASSWORD ?? 'password',
    'Content Author',
    'CONTENT_AUTHOR',
  );
  const contentReviewer = await upsertUser(
    process.env.SEED_CONTENT_REVIEWER_EMAIL ?? 'reviewer@nextstep2.dev',
    process.env.SEED_CONTENT_REVIEWER_PASSWORD ?? 'password',
    'Content Reviewer',
    'CONTENT_REVIEWER',
  );
  await upsertUser(
    process.env.SEED_STUDENT_EMAIL ?? 'jordan.smith@nextstep2.dev',
    process.env.SEED_STUDENT_PASSWORD ?? 'password',
    'Jordan Smith',
    'STUDENT',
  );
  console.log('Accounts seeded.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
