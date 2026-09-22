import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { WebviewAuthService } from '../webview-auth/webview-auth.service';
import {
  RetryableCoreApiError,
  TerminalCoreApiError,
} from '../core-api/core-api.errors';
import { LoginWebviewDto } from './dto/login-webview.dto';

// Login webview posts straight here, not through webview-auth's /auth/exchange —
// there's no draft to fetch, and the credentials themselves are the payload,
// not a code trade. See project-info.md's "Auth model".
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly webviewAuthService: WebviewAuthService,
  ) {}

  @Post('login-webview')
  @HttpCode(HttpStatus.OK)
  async loginWebview(@Body() dto: LoginWebviewDto): Promise<{ success: true }> {
    const state = await this.webviewAuthService.peekLoginCode(dto.code);
    if (!state) {
      throw new UnauthorizedException(
        'Este enlace ya no es válido, solicita uno nuevo desde WhatsApp.',
      );
    }

    try {
      await this.authService.login(state.phoneNumber, dto.email, dto.password);
      await this.webviewAuthService.burnLoginCode(dto.code);
      return { success: true };
    } catch (error) {
      if (error instanceof TerminalCoreApiError) {
        const attemptsRemaining =
          await this.webviewAuthService.registerLoginFailure(dto.code);
        if (attemptsRemaining === null) {
          throw new UnauthorizedException(
            'Este enlace ya no es válido, solicita uno nuevo desde WhatsApp.',
          );
        }
        const message = error.coreApiMessage?.includes('no está autorizado')
          ? 'Tu número de WhatsApp no está autorizado para este emisor.'
          : 'Credenciales inválidas.';
        throw new BadRequestException({ message, attemptsRemaining });
      }
      if (error instanceof RetryableCoreApiError) {
        throw new ServiceUnavailableException(
          'No pudimos conectar, intenta de nuevo en un momento.',
        );
      }
      throw error;
    }
  }

  @Get('login-webview/phone')
  async getPhoneForLoginCode(@Query('code') code: string) {
    const state = await this.webviewAuthService.peekLoginCode(code);
    if (!state) throw new NotFoundException();
    return state;
  }
}
