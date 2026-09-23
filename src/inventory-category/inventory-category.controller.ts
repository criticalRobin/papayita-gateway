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
import { INVENTORY_CATEGORY_CLIENT } from './inventory-category.service';
import type { InventoryCategoryClient } from './inventory-category-client.interface';
import { CreateOrUpdateInventoryCategoryDto } from './dto/create-or-update-inventory-category.dto';

@Controller('webview/inventory/categories')
@UseGuards(WebviewSessionGuard)
export class InventoryCategoryController {
  constructor(
    @Inject(INVENTORY_CATEGORY_CLIENT)
    private readonly inventoryCategoryClient: InventoryCategoryClient,
    private readonly authService: AuthService,
  ) {}

  @Get()
  async findAll(@Req() req: RequestWithWebviewSession) {
    const token = await this.getToken(req);
    return this.inventoryCategoryClient.findAll(
      token,
      req.webviewSession.emisorId!,
    );
  }

  @Post()
  async create(
    @Req() req: RequestWithWebviewSession,
    @Body() dto: CreateOrUpdateInventoryCategoryDto,
  ) {
    const token = await this.getToken(req);
    return this.inventoryCategoryClient.create(
      token,
      req.webviewSession.emisorId!,
      dto,
    );
  }

  @Put(':id')
  async update(
    @Req() req: RequestWithWebviewSession,
    @Param('id') id: string,
    @Body() dto: CreateOrUpdateInventoryCategoryDto,
  ) {
    const token = await this.getToken(req);
    return this.inventoryCategoryClient.update(
      token,
      req.webviewSession.emisorId!,
      id,
      dto,
    );
  }

  @Delete(':id')
  async remove(@Req() req: RequestWithWebviewSession, @Param('id') id: string) {
    const token = await this.getToken(req);
    return this.inventoryCategoryClient.delete(
      token,
      req.webviewSession.emisorId!,
      id,
    );
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
