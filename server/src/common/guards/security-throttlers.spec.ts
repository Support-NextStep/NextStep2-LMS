import { AuthThrottlerGuard } from './auth-throttler.guard';
import { StudentThrottlerGuard } from './student-throttler.guard';

// Day 8 security hardening — pure unit coverage for the two new rate-limit
// trackers' key composition. The actual throttling behavior (429 after N
// requests) is exercised end-to-end against the real backend in
// app/tests/securityHardening.spec.ts; this only proves each tracker reads
// identity from the right place — IP+email (never a role, never anything
// else) for auth, and the verified JWT subject (never the raw IP alone,
// unless truly unauthenticated) for student actions.

describe('AuthThrottlerGuard tracker', () => {
  it('combines IP and lower-cased email into one key', async () => {
    const guard = new AuthThrottlerGuard({} as never, {} as never, {} as never);
    const tracker = await (guard as unknown as { getTracker(req: unknown): Promise<string> }).getTracker({
      ip: '127.0.0.1',
      body: { email: 'Someone@Example.com' },
    });
    expect(tracker).toBe('127.0.0.1:someone@example.com');
  });

  it('falls back safely when email is missing from the body (never throws, never undefined)', async () => {
    const guard = new AuthThrottlerGuard({} as never, {} as never, {} as never);
    const tracker = await (guard as unknown as { getTracker(req: unknown): Promise<string> }).getTracker({ ip: '10.0.0.1', body: {} });
    expect(tracker).toBe('10.0.0.1:no-email');
  });

  it('two different accounts from the same IP never collide (each gets its own tracker key)', async () => {
    const guard = new AuthThrottlerGuard({} as never, {} as never, {} as never);
    const getTracker = (guard as unknown as { getTracker(req: unknown): Promise<string> }).getTracker.bind(guard);
    const a = await getTracker({ ip: '127.0.0.1', body: { email: 'a@test.local' } });
    const b = await getTracker({ ip: '127.0.0.1', body: { email: 'b@test.local' } });
    expect(a).not.toBe(b);
  });
});

describe('StudentThrottlerGuard tracker', () => {
  it('uses the verified JWT subject when present — never a client-supplied field', async () => {
    const guard = new StudentThrottlerGuard({} as never, {} as never, {} as never);
    const tracker = await (guard as unknown as { getTracker(req: unknown): Promise<string> }).getTracker({
      user: { sub: 'real-student-id', role: 'STUDENT' },
      body: { studentId: 'attacker-supplied-id' }, // must be ignored
      ip: '203.0.113.7',
    });
    expect(tracker).toBe('real-student-id');
  });

  it('falls back to IP only when genuinely unauthenticated (defensive — this guard only ever runs after JwtAuthGuard in practice)', async () => {
    const guard = new StudentThrottlerGuard({} as never, {} as never, {} as never);
    const tracker = await (guard as unknown as { getTracker(req: unknown): Promise<string> }).getTracker({ ip: '203.0.113.7' });
    expect(tracker).toBe('203.0.113.7');
  });
});
