import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import type { Role, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { JwtPayload } from './types/jwt-payload';

export type PublicUser = { id: string; email: string; name: string; role: Role };

export type IssuedTokens = {
  accessToken: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenTtlSeconds: number;
};

/**
 * Rebuilt field-by-field, never a spread of the Prisma `User` row — this is
 * the one place a passwordHash leak into an API response would happen if
 * anyone ever added a field to User without also touching this function.
 * See the Phase 0 security rule: never expose passwords or password hashes.
 */
function toPublicUser(user: User): PublicUser {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

function hashRefreshToken(rawToken: string): string {
  // A refresh token is a 384-bit random value, not a human-chosen secret —
  // a fast hash is the correct, standard choice for looking it up (unlike
  // passwords, which use the slow argon2id below specifically to resist
  // offline brute-forcing of a low-entropy human-chosen value).
  return createHash('sha256').update(rawToken).digest('hex');
}

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Self-registration ALWAYS creates a student — `role` is never accepted
   * from the caller (RegisterDto has no such field at all). Internal roles
   * (admin/content_author/content_reviewer) are provisioned out-of-band —
   * see prisma/seed.ts — there is no endpoint anywhere that lets a client
   * choose its own role.
   */
  async register(email: string, password: string, name: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ForbiddenException('An account with this email already exists.');

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    return this.prisma.user.create({
      data: { email, passwordHash, name, role: 'STUDENT' },
    });
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Deliberately identical error/timing-shape for "no such user" and
    // "wrong password" — never reveal which one it was.
    if (!user) throw new UnauthorizedException('Invalid email or password.');

    const valid = await argon2.verify(user.passwordHash, password);
    if (!valid) throw new UnauthorizedException('Invalid email or password.');

    return user;
  }

  async issueTokens(user: User): Promise<IssuedTokens> {
    const payload: JwtPayload = { sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL_SECONDS });

    const rawRefreshToken = randomBytes(48).toString('hex');
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(rawRefreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      },
    });

    return {
      accessToken,
      accessTokenTtlSeconds: ACCESS_TOKEN_TTL_SECONDS,
      refreshToken: rawRefreshToken,
      refreshTokenTtlSeconds: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  /** Validates the presented refresh token, revokes it, and issues a fresh pair (rotation) — the same raw token can never be redeemed twice. */
  async rotateRefreshToken(rawRefreshToken: string): Promise<IssuedTokens> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    const stored = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token is invalid, expired, or already used.');
    }

    await this.prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });

    const user = await this.prisma.user.findUnique({ where: { id: stored.userId } });
    if (!user) throw new UnauthorizedException('Account no longer exists.');

    return this.issueTokens(user);
  }

  async revokeRefreshToken(rawRefreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawRefreshToken);
    // updateMany + a where-not-already-revoked guard, rather than
    // find-then-update — logout is idempotent and never throws just because
    // the token was already revoked or never existed (a stale cookie from an
    // already-logged-out tab must not surface an error).
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async getUserById(userId: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }
}

export { toPublicUser };
