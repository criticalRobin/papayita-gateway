import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CoreApiModule } from '../core-api/core-api.module';
import { AuthModule } from '../auth/auth.module';
import { WebviewSessionModule } from '../webview-session/webview-session.module';
import { InventoryCategoryModule } from '../inventory-category/inventory-category.module';
import { TaxCatalogModule } from '../tax-catalog/tax-catalog.module';
import {
  INVENTORY_PRODUCT_CLIENT,
  INVENTORY_PRODUCT_REDIS_CLIENT,
  InventoryProductService,
} from './inventory-product.service';
import { InventoryProductController } from './inventory-product.controller';

@Module({
  imports: [
    ConfigModule,
    CoreApiModule,
    AuthModule,
    WebviewSessionModule,
    InventoryCategoryModule,
    TaxCatalogModule,
  ],
  providers: [
    {
      provide: INVENTORY_PRODUCT_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        }),
    },
    { provide: INVENTORY_PRODUCT_CLIENT, useClass: InventoryProductService },
  ],
  controllers: [InventoryProductController],
  exports: [INVENTORY_PRODUCT_CLIENT],
})
export class InventoryProductModule {}
