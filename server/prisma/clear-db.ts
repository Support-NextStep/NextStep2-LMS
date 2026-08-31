import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting DB cleanup...');

  // 1. Delete Publications
  const pubRes = await prisma.publication.deleteMany();
  console.log(`Deleted ${pubRes.count} Publications`);

  // 2. Delete ContentVersions
  const verRes = await prisma.contentVersion.deleteMany();
  console.log(`Deleted ${verRes.count} ContentVersions`);

  // 3. Delete ContentPackages
  const pkgRes = await prisma.contentPackage.deleteMany();
  console.log(`Deleted ${pkgRes.count} ContentPackages`);

  // 4. Delete Sessions
  const sesRes = await prisma.session.deleteMany();
  console.log(`Deleted ${sesRes.count} Sessions`);

  // 5. Delete Subjects
  const subRes = await prisma.subject.deleteMany();
  console.log(`Deleted ${subRes.count} Subjects`);

  // 6. Delete Courses
  const crsRes = await prisma.course.deleteMany();
  console.log(`Deleted ${crsRes.count} Courses`);

  // Verify users
  const users = await prisma.user.findMany({
    select: { email: true, role: true }
  });
  console.log('Remaining Users:', users);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
