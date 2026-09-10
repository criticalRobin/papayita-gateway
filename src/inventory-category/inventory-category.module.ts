import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CoreApiModule } from '../core-api/core-api.module';
import { AuthModule } from '../auth/auth.module';
import { WebviewSessionModule } from '../webview-session/webview-session.module';
import {
  INVENTORY_CATEGORY_CLIENT,
  INVENTORY_CATEGORY_REDIS_CLIENT,
  InventoryCategoryService,
} from './inventory-category.service';
import { InventoryCategoryController } from './inventory-category.controller';

@Module({
  imports: [ConfigModule, CoreApiModule, AuthModule, WebviewSessionModule],
  providers: [
    {
      provide: INVENTORY_CATEGORY_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        }),
    },
    { provide: INVENTORY_CATEGORY_CLIENT, useClass: InventoryCategoryService },
  ],
  controllers: [InventoryCategoryController],
  exports: [INVENTORY_CATEGORY_CLIENT],
})
export class InventoryCategoryModule {}
