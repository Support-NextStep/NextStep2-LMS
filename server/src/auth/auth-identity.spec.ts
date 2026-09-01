import { randomUUID } from 'crypto';
import { createConnection } from 'net';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, toPublicUser } from './auth.service';

// ---------------------------------------------------------------------------
// Real Student Identity slice — GET /auth/me is the one endpoint this whole
// slice's frontend fix depends on (see ../../app/src/data/progress.tsx's
// currentUser): every student-facing page now trusts it, instead of
// mock.ts's hardcoded STUDENT, to answer "who is logged in." It already
// existed before this slice (Phase 0) and was already exercised live via
// manual browser testing across several prior slices, but had no automated
// test of its own — this closes that gap. Same service-level integration
// convention as every other spec in this project (see
// evaluation-reliability.spec.ts's header comment for the full reasoning).
// ---------------------------------------------------------------------------

function assertNoLiveBackendServer(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    const fail = () => {
      socket.destroy();
      reject(new Error(`A live server is already listening on port ${port}. Stop the dev server before running this integration suite.`));
    };
    socket.setTimeout(300);
    socket.on('connect', fail);
    socket.on('timeout', () => {
      socket.destroy();
      resolve();
    });
    socket.on('error', () => resolve());
  });
}

describe('AuthService — identity isolation (integration, real Postgres)', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  const createdUserIds: string[] = [];

  async function createTestUser(name: string): Promise<{ id: string; email: string; name: string }> {
    const email = `auth-identity-${randomUUID()}@example.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: 'not-a-real-hash-this-user-never-logs-in', role: 'STUDENT', name },
    });
    createdUserIds.push(user.id);
    return { id: user.id, email, name };
  }

  beforeAll(async () => {
    await assertNoLiveBackendServer(Number(process.env.PORT) || 3000);
    prisma = new PrismaService();
    await prisma.$connect();
    authService = new AuthService(prisma, null as never);
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  it("getUserById returns exactly the requested user's own row — never another user's, even when both exist", async () => {
    const a = await createTestUser('Auth Identity Test A');
    const b = await createTestUser('Auth Identity Test B');

    const foundA = await authService.getUserById(a.id);
    const foundB = await authService.getUserById(b.id);

    expect(foundA?.id).toBe(a.id);
    expect(foundA?.name).toBe(a.name);
    expect(foundB?.id).toBe(b.id);
    expect(foundB?.name).toBe(b.name);
    expect(foundA?.id).not.toBe(foundB?.id);
  });

  it('getUserById returns null for an id that does not exist, never an arbitrary/wrong user', async () => {
    const found = await authService.getUserById('00000000-0000-0000-0000-000000000000');
    expect(found).toBeNull();
  });

  it('toPublicUser never includes passwordHash or any other sensitive field, regardless of what is on the underlying row', async () => {
    const a = await createTestUser('Auth Identity Test Public Shape');
    const row = await authService.getUserById(a.id);
    if (!row) throw new Error('expected row to exist');

    const publicUser = toPublicUser(row);
    expect(publicUser).toEqual({ id: row.id, email: row.email, name: row.name, role: row.role });
    expect(Object.keys(publicUser).sort()).toEqual(['email', 'id', 'name', 'role']);
    expect('passwordHash' in publicUser).toBe(false);
  });
});
