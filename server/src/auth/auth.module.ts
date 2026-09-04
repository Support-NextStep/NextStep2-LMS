import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthThrottlerGuard } from '../common/guards/auth-throttler.guard';

/**
 * Global for the same reason PrismaModule is (see its own doc comment):
 * JwtAuthGuard is cross-cutting infrastructure every feature module needs
 * to protect its routes, not a domain concern specific to auth's own
 * routes.
 *
 * `JwtModule` is re-exported (not just imported) for a specific reason:
 * `JwtAuthGuard` depends on `JwtService`, which only becomes part of
 * AuthModule's OWN resolvable providers because `JwtModule.registerAsync`
 * is in `imports` — but `imports` alone never makes a module's providers
 * available to whoever imports *this* module. Without re-exporting
 * `JwtModule` here too, `@UseGuards(JwtAuthGuard)` in another module (e.g.
 * ContentModule/PackagesModule/ReviewModule) fails at startup with
 * "Nest can't resolve dependencies of the JwtAuthGuard... JwtService...
 * is available in the ContentModule module" — Nest instantiates a fresh
 * JwtAuthGuard for the consuming module's own context, and that context
 * needs its own path to JwtService.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_ACCESS_SECRET');
        if (!secret) {
          throw new Error('JWT_ACCESS_SECRET must be set — refusing to start with no signing secret.');
        }
        return { secret };
      },
    }),
    // Day 8 security hardening — see AuthThrottlerGuard's own doc comment
    // for why tracking is (IP + email), not IP alone. This module-level
    // default (10 per 15 minutes) applies to /auth/register; /auth/login's
    // own @Throttle override on the controller is more generous (50/minute)
    // since a handful of real seed accounts are legitimately re-logged-into
    // very often — see that decorator's own comment.
    ThrottlerModule.forRoot([{ name: 'auth', ttl: 15 * 60 * 1000, limit: 10 }]),
  ],
  controllers: [AuthController],
  // JwtAuthGuard is provided here (not just instantiated ad hoc) so other
  // modules can @UseGuards(JwtAuthGuard) via Nest's DI and get the same
  // configured JwtService injected into it.
  providers: [AuthService, JwtAuthGuard, AuthThrottlerGuard],
  exports: [AuthService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
