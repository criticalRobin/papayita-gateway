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
    const phoneNumber = await this.webviewAuthService.consumeLoginCode(
      dto.code,
    );
    if (!phoneNumber) {
      throw new UnauthorizedException(
        'Este enlace ya no es válido, solicita uno nuevo desde WhatsApp.',
      );
    }

    try {
      await this.authService.login(phoneNumber, dto.email, dto.password);
      return { success: true };
    } catch (error) {
      if (error instanceof TerminalCoreApiError) {
        throw new BadRequestException('Credenciales inválidas.');
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
    const phoneNumber = await this.webviewAuthService.peekPhoneForCode(code);
    if (!phoneNumber) throw new NotFoundException();
    return { phoneNumber };
  }
}
