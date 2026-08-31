import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthenticatedRequest } from '../types/authenticated-request';
import type { JwtPayload } from '../../auth/types/jwt-payload';

const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * Verifies the access token from the httpOnly cookie (never an
 * Authorization header from localStorage — Phase 0's whole point is moving
 * off client-readable/client-writable session storage). On success, attaches
 * the verified payload to `req.user`; this is the only place `req.user` is
 * ever set, so every downstream handler can trust it completely.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token: unknown = request.cookies?.[ACCESS_TOKEN_COOKIE];

    if (typeof token !== 'string' || !token) {
      throw new UnauthorizedException('No access token.');
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token);
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }
  }
}
