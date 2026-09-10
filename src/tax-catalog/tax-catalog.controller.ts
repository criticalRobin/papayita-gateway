import {
  Controller,
  Get,
  Inject,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { WebviewSessionGuard } from '../webview-session/webview-session.guard';
import type { RequestWithWebviewSession } from '../webview-session/webview-session.guard';
import { AuthService } from '../auth/auth.service';
import { TAX_CATALOG_CLIENT } from './tax-catalog.service';
import type { TaxCatalogClient } from './tax-catalog-client.interface';

@Controller('webview/inventory/taxes')
@UseGuards(WebviewSessionGuard)
export class TaxCatalogController {
  constructor(
    @Inject(TAX_CATALOG_CLIENT)
    private readonly taxCatalogClient: TaxCatalogClient,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async findAll(@Req() req: RequestWithWebviewSession) {
    const token = await this.authService.getValidToken(
      req.webviewSession.phoneNumber,
    );
    if (!token) {
      throw new UnauthorizedException(
        'Tu sesión ya no es válida, vuelve a escribir "administrar productos".',
      );
    }
    return this.taxCatalogClient.findAll(token);
  }
}
