import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WebviewAuthModule } from '../webview-auth/webview-auth.module';
import { WebviewSessionModule } from '../webview-session/webview-session.module';
import { InventoryAuthExchangeController } from './inventory-auth-exchange.controller';

@Module({
  imports: [AuthModule, WebviewAuthModule, WebviewSessionModule],
  controllers: [InventoryAuthExchangeController],
})
export class InventoryWebviewAuthModule {}
