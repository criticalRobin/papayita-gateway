import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module';
import { PurchasesService } from './purchases.service';

export const PURCHASES_CLIENT = 'PURCHASES_CLIENT';

@Module({
  imports: [CoreApiModule],
  providers: [{ provide: PURCHASES_CLIENT, useClass: PurchasesService }],
  exports: [PURCHASES_CLIENT],
})
export class PurchasesModule {}
