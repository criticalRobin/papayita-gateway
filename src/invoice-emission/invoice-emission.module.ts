import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CoreApiModule } from '../core-api/core-api.module';
import { InvoiceEmissionService } from './invoice-emission.service';
import {
  INVOICE_EMISSION_REDIS_CLIENT,
  PendingEmissionStore,
} from './pending-emission.store';

export const INVOICE_EMISSION_CLIENT = 'INVOICE_EMISSION_CLIENT';

@Module({
  imports: [ConfigModule, CoreApiModule],
  providers: [
    { provide: INVOICE_EMISSION_CLIENT, useClass: InvoiceEmissionService },
    {
      provide: INVOICE_EMISSION_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        }),
    },
    PendingEmissionStore,
  ],
  exports: [INVOICE_EMISSION_CLIENT, PendingEmissionStore],
})
export class InvoiceEmissionModule {}
