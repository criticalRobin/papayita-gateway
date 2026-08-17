import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappClientModule } from '../whatsapp/client/whatsapp.module';
import { WhatsappInboundProcessor } from './processors/whatsapp-inbound.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
        },
      }),
    }),
    BullModule.registerQueue({
      name: 'whatsapp-messages',
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      },
    }),
    WhatsappClientModule,
  ],
  providers: [WhatsappInboundProcessor],
  exports: [BullModule],
})
export class QueueModule {}
