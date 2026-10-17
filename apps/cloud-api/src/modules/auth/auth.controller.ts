import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  LoginRequestSchema,
  PasswordChangeRequestSchema,
  PasswordForgotRequestSchema,
  PasswordResetRequestSchema,
  TotpDisableRequestSchema,
  TotpEnableRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type MeResponse,
  type PasswordChangeRequest,
  type PasswordForgotRequest,
  type PasswordForgotResponse,
  type PasswordResetRequest,
  type SessionsResponse,
  type TotpDisableRequest,
  type TotpEnableResponse,
  type TotpSetupResponse,
} from '@cbt/shared-types';
import { AuthService } from './auth.service';
import { ConfigService } from '../../common/config/config.service';
import { CurrentAuth } from './decorators/current-auth.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from './dto/zod-validation.pipe';
import { AuthContext, RequestContext } from './domain/types';
import { AuthRequest } from './http/request';
import { clearAuthCookies, ensureCookies, csrfCookie, sessionCookie } from './http/cookies';
import { HttpResponse } from '../../common/http/http-types';

/**
 * Cloud sign-in and session endpoints (API and Sync Specification section 3).
 *
 * The global authentication guard protects everything here except the routes
 * marked `@Public()`; the CSRF guard protects state-changing methods that carry a
 * session.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginRequestSchema)) body: LoginRequest,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<LoginResponse> {
    const { response: payload, issued } = await this.auth.login(body, this.context(request));
    const secure = this.config.cookieSecure;
    response.setHeader('Set-Cookie', [
      sessionCookie(issued.token, issued.ttlSeconds, secure),
      csrfCookie(issued.csrfToken, issued.ttlSeconds, secure),
    ]);
    return payload;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<void> {
    await this.auth.logout(auth.user, auth.session, this.context(request));
    response.setHeader('Set-Cookie', clearAuthCookies(this.config.cookieSecure));
  }

  @Get('me')
  me(@CurrentAuth() auth: AuthContext): MeResponse {
    return this.auth.me(auth.user, auth.session);
  }

  @Get('sessions')
  sessions(@CurrentAuth() auth: AuthContext): Promise<SessionsResponse> {
    return this.auth.listSessions(auth.user, auth.session.id);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() request: AuthRequest,
  ): Promise<void> {
    await this.auth.revokeSession(auth.user, id, this.context(request));
  }

  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(PasswordChangeRequestSchema)) body: PasswordChangeRequest,
    @Req() request: AuthRequest,
  ): Promise<void> {
    await this.auth.changePassword(auth.user, body, auth.session.id, this.context(request));
  }

  @Public()
  @Post('password/forgot')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(
    @Body(new ZodValidationPipe(PasswordForgotRequestSchema)) body: PasswordForgotRequest,
    @Req() request: AuthRequest,
  ): Promise<PasswordForgotResponse> {
    return this.auth.forgotPassword(body, this.context(request));
  }

  @Public()
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resetPassword(
    @Body(new ZodValidationPipe(PasswordResetRequestSchema)) body: PasswordResetRequest,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<void> {
    await this.auth.resetPassword(body, this.context(request));
    response.setHeader('Set-Cookie', clearAuthCookies(this.config.cookieSecure));
  }

  @Post('2fa/setup')
  @HttpCode(HttpStatus.OK)
  setupTotp(
    @CurrentAuth() auth: AuthContext,
    @Req() request: AuthRequest,
  ): Promise<TotpSetupResponse> {
    return this.auth.setupTotp(auth.user, this.context(request));
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  enableTotp(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(TotpEnableRequestSchema)) body: { code: string },
    @Req() request: AuthRequest,
  ): Promise<TotpEnableResponse> {
    return this.auth.enableTotp(auth.user, body.code, this.context(request));
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  async disableTotp(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodValidationPipe(TotpDisableRequestSchema))
    body: TotpDisableRequest,
    @Req() request: AuthRequest,
  ): Promise<void> {
    await this.auth.disableTotp(auth.user, body, this.context(request));
  }

  /** Build request metadata for sessions and audit entries. */
  private context(request: AuthRequest): RequestContext {
    ensureCookies(request);
    const userAgent = request.headers['user-agent'];
    return {
      ip: request.ip ?? 'unknown',
      userAgent: typeof userAgent === 'string' ? userAgent : '',
      requestId: request.requestId ?? 'unknown',
    };
  }
}
