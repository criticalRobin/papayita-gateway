import { Module } from '@nestjs/common';
import { CoreApiModule } from '../core-api/core-api.module';
import { EmisorService } from './emisor.service';

export const EMISOR_CLIENT = 'EMISOR_CLIENT';

@Module({
  imports: [CoreApiModule],
  providers: [{ provide: EMISOR_CLIENT, useClass: EmisorService }],
  exports: [EMISOR_CLIENT],
})
export class EmisorModule {}
