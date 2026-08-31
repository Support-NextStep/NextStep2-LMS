import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticated-request';

/**
 * Reads the verified JWT payload JwtAuthGuard attached to the request —
 * never a client-supplied body/query field. This is the ONLY sanctioned way
 * a controller learns "who is making this request" (see the Phase 0 security
 * rules: never trust a client-supplied userId or role).
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.user;
});
