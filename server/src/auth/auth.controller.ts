import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthService, toPublicUser, type IssuedTokens } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthThrottlerGuard } from '../common/guards/auth-throttler.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from './types/jwt-payload';

const ACCESS_TOKEN_COOKIE = 'access_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private baseCookieOptions(): CookieOptions {
    // secure defaults to true unless explicitly disabled (local HTTP dev) —
    // fail toward the safer setting, never the other way around.
    const secure = this.configService.get<string>('COOKIE_SECURE', 'true') !== 'false';
    return { httpOnly: true, secure, sameSite: 'lax', path: '/' };
  }

  private setAuthCookies(res: Response, tokens: IssuedTokens) {
    const base = this.baseCookieOptions();
    res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, { ...base, maxAge: tokens.accessTokenTtlSeconds * 1000 });
    res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...base,
      maxAge: tokens.refreshTokenTtlSeconds * 1000,
      // The refresh cookie is only ever needed by /auth/refresh and
      // /auth/logout — scoping its path keeps it out of every other
      // request's cookie header for no functional loss.
      path: '/auth',
    });
  }

  private clearAuthCookies(res: Response) {
    const base = this.baseCookieOptions();
    res.clearCookie(ACCESS_TOKEN_COOKIE, base);
    res.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: '/auth' });
  }

  @Post('register')
  @UseGuards(AuthThrottlerGuard)
  @Throttle({ auth: { limit: 10, ttl: 15 * 60 * 1000 } })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.register(dto.email, dto.password, dto.name);
    const tokens = await this.authService.issueTokens(user);
    this.setAuthCookies(res, tokens);
    return toPublicUser(user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthThrottlerGuard)
  // A higher, per-minute limit than register: the same handful of seed
  // accounts (author@/reviewer@/admin@) are legitimately re-logged-into
  // very often (role-switching tests, session-refresh checks, this repo's
  // own Playwright suites) — 50/minute per (IP, email) still makes rapid
  // automated brute-forcing of one password impractically slow (under one
  // guess/second against an argon2id hash) while never touching real usage.
  @Throttle({ auth: { limit: 50, ttl: 60 * 1000 } })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const user = await this.authService.validateCredentials(dto.email, dto.password);
    const tokens = await this.authService.issueTokens(user);
    this.setAuthCookies(res, tokens);
    return toPublicUser(user);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof raw !== 'string' || !raw) {
      this.clearAuthCookies(res);
      return { message: 'No refresh token presented.' };
    }

    const tokens = await this.authService.rotateRefreshToken(raw);
    this.setAuthCookies(res, tokens);
    return { refreshed: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw: unknown = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof raw === 'string' && raw) {
      await this.authService.revokeRefreshToken(raw);
    }
    this.clearAuthCookies(res);
    return { loggedOut: true };
  }

  /**
   * The one endpoint every `useRequireXAccount()` frontend hook calls to
   * answer "is anyone logged in, and as what role" — always a fresh
   * database lookup by the verified token's `sub`, never a value trusted
   * from the token payload itself beyond the id used to look it up.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() tokenUser: JwtPayload) {
    const user = await this.authService.getUserById(tokenUser.sub);
    if (!user) return null;
    return toPublicUser(user);
  }
}
