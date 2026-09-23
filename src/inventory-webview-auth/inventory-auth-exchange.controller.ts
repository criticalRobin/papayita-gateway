import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { WebviewAuthService } from '../webview-auth/webview-auth.service';
import { WebviewSessionService } from '../webview-session/webview-session.service';
import { ExchangeInventoryCodeDto } from './dto/exchange-inventory-code.dto';

// Same reasoning as draft-builder/auth-exchange.controller.ts: this endpoint
// needs AuthModule, WebviewAuthModule, and WebviewSessionModule all at once.
// AuthModule already imports WebviewAuthModule, so registering this
// controller inside either of those would close a circular dependency —
// this standalone module keeps every import one-directional.
@Controller('auth/inventory')
export class InventoryAuthExchangeController {
  constructor(
    private readonly authService: AuthService,
    private readonly webviewAuthService: WebviewAuthService,
    private readonly webviewSessionService: WebviewSessionService,
  ) {}

  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() dto: ExchangeInventoryCodeDto) {
    const phoneNumber = await this.webviewAuthService.resolveInventoryCode(
      dto.code,
    );
    if (!phoneNumber) {
      throw new UnauthorizedException(
        'Este enlace ya no es válido, vuelve a escribir "administrar productos".',
      );
    }

    const emisorId = await this.authService.getEmisorId(phoneNumber);
    if (!emisorId) {
      throw new UnauthorizedException(
        'Tu sesión ya no es válida, vuelve a escribir "administrar productos".',
      );
    }

    const sessionToken = await this.webviewSessionService.createSession({
      phoneNumber,
      emisorId,
    });

    return { sessionToken };
  }
}
