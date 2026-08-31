import type { Request } from 'express';
import type { JwtPayload } from '../../auth/types/jwt-payload';

/** What JwtAuthGuard attaches to `req.user` after verifying the access-token cookie. Never anything a client can set directly. */
export type AuthenticatedRequest = Request & { user: JwtPayload };
