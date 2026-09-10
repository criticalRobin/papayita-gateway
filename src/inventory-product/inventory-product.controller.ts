import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { WebviewSessionGuard } from '../webview-session/webview-session.guard';
import type { RequestWithWebviewSession } from '../webview-session/webview-session.guard';
import { AuthService } from '../auth/auth.service';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { INVENTORY_PRODUCT_CLIENT } from './inventory-product.service';
import type { InventoryProductClient } from './inventory-product-client.interface';
import { CreateOrUpdateInventoryProductDto } from './dto/create-or-update-inventory-product.dto';

@Controller('webview/inventory/products')
@UseGuards(WebviewSessionGuard)
export class InventoryProductController {
  constructor(
    @Inject(INVENTORY_PRODUCT_CLIENT)
    private readonly inventoryProductClient: InventoryProductClient,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async findAll(@Req() req: RequestWithWebviewSession) {
    const token = await this.getToken(req);
    return this.inventoryProductClient.findAll(
      token,
      req.webviewSession.emisorId!,
    );
  }

  @Post()
  async create(
    @Req() req: RequestWithWebviewSession,
    @Body() dto: CreateOrUpdateInventoryProductDto,
  ) {
    const token = await this.getToken(req);
    return this.inventoryProductClient.create(
      token,
      req.webviewSession.emisorId!,
      dto,
    );
  }

  @Put(':id')
  async update(
    @Req() req: RequestWithWebviewSession,
    @Param('id') id: string,
    @Body() dto: CreateOrUpdateInventoryProductDto,
  ) {
    const token = await this.getToken(req);
    return this.inventoryProductClient.update(
      token,
      req.webviewSession.emisorId!,
      id,
      dto,
    );
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithWebviewSession, @Param('id') id: string) {
    const token = await this.getToken(req);
    return this.inventoryProductClient.delete(token, id);
  }

  private async getToken(
    req: RequestWithWebviewSession,
  ): Promise<CoreApiUserToken> {
    const token = await this.authService.getValidToken(
      req.webviewSession.phoneNumber,
    );
    if (!token) {
      throw new UnauthorizedException(
        'Tu sesión ya no es válida, vuelve a escribir "administrar productos".',
      );
    }
    return token;
  }
}
