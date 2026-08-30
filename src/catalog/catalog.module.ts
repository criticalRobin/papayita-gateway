import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module';
import { CatalogService } from './catalog.service';

export const CATALOG_SEARCH_CLIENT = 'CATALOG_SEARCH_CLIENT';

@Module({
  imports: [CoreApiModule],
  providers: [{ provide: CATALOG_SEARCH_CLIENT, useClass: CatalogService }],
  exports: [CATALOG_SEARCH_CLIENT],
})
export class CatalogModule {}
