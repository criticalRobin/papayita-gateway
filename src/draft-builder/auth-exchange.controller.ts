import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { WebviewAuthService } from '../webview-auth/webview-auth.service';
import { DraftBuilderService } from './draft-builder.service';
import { ExchangeCodeDto } from './dto/exchange-code.dto';

// Conceptually this is webview-auth's `POST /auth/exchange` per coding-guide.md,
// but the NestJS controller is registered here (in draft-builder's module)
// rather than in webview-auth's own module. Reason: this endpoint needs both
// WebviewAuthService (to consume the code) and DraftBuilderService (to return
// the draft in the same call) — if webview-auth's own module imported
// draft-builder for that, and draft-builder needs auth's module for tokens,
// and auth's module already imports webview-auth, that closes a 3-module
// circular dependency (AuthModule -> WebviewAuthModule -> DraftBuilderModule
// -> AuthModule). Registering the controller here instead keeps every import
// one-directional with no forwardRef.
@Controller('auth')
export class AuthExchangeController {
  constructor(
    private readonly webviewAuthService: WebviewAuthService,
    private readonly draftBuilderService: DraftBuilderService,
  ) {}

  @Post('exchange')
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() dto: ExchangeCodeDto) {
    const consumed = await this.webviewAuthService.consumeExchangeCode(
      dto.code,
    );
    if (!consumed) {
      throw new UnauthorizedException(
        'Este enlace ya no es válido, pídele a tu negocio que envíe la factura de nuevo.',
      );
    }

    const draft = await this.draftBuilderService.getDraft(
      consumed.phoneNumber,
      consumed.correlationId,
    );

    return { sessionToken: consumed.sessionToken, draft };
  }
}
