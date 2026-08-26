import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappClientModule } from '../whatsapp/client/whatsapp.module';
import { SttModule } from '../stt/stt.module';
import { ClassificationModule } from '../classification/classification.module';
import { ConversationStateModule } from '../conversation-state/conversation-state.module';
import { WhatsappInboundProcessor } from './processors/whatsapp-inbound.processor';
import { ExtractionModule } from '../extraction/extraction.module';

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
    SttModule,
    ClassificationModule,
    ConversationStateModule,
    ExtractionModule,
  ],
  providers: [WhatsappInboundProcessor],
  exports: [BullModule],
})
export class QueueModule {}
