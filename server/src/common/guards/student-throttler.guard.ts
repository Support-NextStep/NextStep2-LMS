import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { JwtPayload } from '../../auth/types/jwt-payload';

/**
 * Day 8 security hardening — rate limiting for authenticated, per-student
 * write actions (currently: exercise submission). Tracked by the verified
 * JWT subject, not IP: this guard only ever runs after JwtAuthGuard has
 * already set `req.user`, so the tracking key is the real, authenticated
 * student id — never a client-supplied value, and never shared across
 * different students behind the same IP/NAT.
 *
 * Exists because submission creation was previously completely
 * unthrottled: each submission enqueues a real background evaluation job
 * (a real Hugging Face call once the worker picks it up), and unlimited
 * submission creation could flood that queue for other students even
 * though the worker's own concurrency cap (Day 4) already bounds actual
 * concurrent AI calls.
 */
@Injectable()
export class StudentThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const user = (req as { user?: JwtPayload }).user;
    return user?.sub ?? (req as { ip?: string }).ip ?? 'unknown';
  }
}
