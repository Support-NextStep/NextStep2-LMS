import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Must run AFTER JwtAuthGuard (which populates req.user from the verified
 * token — never from anything client-supplied). Rejects unless the
 * authenticated user's role is one of the @Roles(...) named on the handler.
 * This is what makes "Content Author cannot access reviewer actions" and
 * "Admin remains read-only" real, server-enforced facts rather than UI
 * affordances.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!required.includes(request.user.role)) {
      throw new ForbiddenException(`This action requires one of the following roles: ${required.join(', ')}.`);
    }
    return true;
  }
}
