import type { Role } from '@prisma/client';

/**
 * The ONLY shape ever signed into an access token. Deliberately minimal —
 * `sub`/`role` are what every guard needs; anything else (name, etc.) is
 * looked up fresh from the database by /auth/me, never trusted from the
 * token itself for anything display-related, so a stale token can't show a
 * stale name after an admin-driven change (not that Phase 0 has one, but the
 * pattern is right from the start).
 */
export type JwtPayload = {
  sub: string;
  role: Role;
};
