import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CoreApiModule } from '../core-api/core-api.module';
import { AuthModule } from '../auth/auth.module';
import { WebviewSessionModule } from '../webview-session/webview-session.module';
import {
  TAX_CATALOG_CLIENT,
  TAX_CATALOG_REDIS_CLIENT,
  TaxCatalogService,
} from './tax-catalog.service';
import { TaxCatalogController } from './tax-catalog.controller';

@Module({
  imports: [ConfigModule, CoreApiModule, AuthModule, WebviewSessionModule],
  providers: [
    {
      provide: TAX_CATALOG_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        }),
    },
    { provide: TAX_CATALOG_CLIENT, useClass: TaxCatalogService },
  ],
  controllers: [TaxCatalogController],
  exports: [TAX_CATALOG_CLIENT],
})
export class TaxCatalogModule {}
