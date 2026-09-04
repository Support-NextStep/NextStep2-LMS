import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Day 8 security hardening — rate limiting for /auth/login and
 * /auth/register. Tracked by (IP + email) rather than IP alone: a real
 * credential-stuffing/brute-force attack repeatedly targets ONE account, so
 * that is the pair that should be bounded. Tracking by IP alone would also
 * throttle a single classroom/office NAT registering or logging in many
 * different legitimate accounts in quick succession (and would throttle
 * this repo's own Playwright suites, which create many disposable student
 * accounts from one local IP) — neither is the actual threat this guard
 * exists to stop.
 */
@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = (req as { ip?: string }).ip ?? 'unknown-ip';
    const body = (req as { body?: Record<string, unknown> }).body;
    const email = typeof body?.email === 'string' ? body.email.toLowerCase() : 'no-email';
    return `${ip}:${email}`;
  }
}
