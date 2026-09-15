import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { WebviewAuthService } from '../webview-auth/webview-auth.service';
import { ConversationStateService } from '../conversation-state/conversation-state.service';
import { ExchangeCodeDto } from './dto/exchange-code.dto';

// Conceptually this is webview-auth's `POST /auth/exchange` per coding-guide.md,
// but the NestJS controller is registered here (in draft-builder's module)
// rather than in webview-auth's own module. Reason: this endpoint needs both
// WebviewAuthService (to consume the code) and something that can read the
// pending document behind the correlationId — if webview-auth's own module
// imported that for it, and that module needs auth's module for tokens, and
// auth's module already imports webview-auth, that closes a 3-module circular
// dependency (AuthModule -> WebviewAuthModule -> [that module] -> AuthModule).
// Registering the controller here instead keeps every import one-directional
// with no forwardRef.
//
// Returns the raw pendingDocument as `draft` regardless of which flow stashed
// it (invoice draft, credit-note candidate list, ...) — each document type
// carries its own `kind` discriminant for the webview to branch on, since a
// single exchange endpoint serves every DRAFT_READY-based flow.
@Controller('auth')
export class AuthExchangeController {
  constructor(
    private readonly webviewAuthService: WebviewAuthService,
    private readonly conversationStateService: ConversationStateService,
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

    const draft = await this.conversationStateService.getPendingDocument(
      consumed.phoneNumber,
      consumed.correlationId,
    );
    if (!draft) {
      throw new NotFoundException(
        'Este enlace ya no es válido, pídele a tu negocio que envíe la factura de nuevo.',
      );
    }

    return { sessionToken: consumed.sessionToken, draft };
  }
}
