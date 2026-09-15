import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WhatsappClientModule } from '../whatsapp/client/whatsapp.module';
import { SttModule } from '../stt/stt.module';
import { ClassificationModule } from '../classification/classification.module';
import { ConversationStateModule } from '../conversation-state/conversation-state.module';
import { WhatsappInboundProcessor } from './processors/whatsapp-inbound.processor';
import { InvoiceEmissionProcessor } from './processors/invoice-emission.processor';
import { ExtractionModule } from '../extraction/extraction.module';
import { AuthModule } from '../auth/auth.module';
import { WebviewAuthModule } from '../webview-auth/webview-auth.module';
import { DraftBuilderModule } from '../draft-builder/draft-builder.module';
import { InvoiceEmissionModule } from '../invoice-emission/invoice-emission.module';
import { CreditNoteModule } from '../credit-note/credit-note.module';

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
    BullModule.registerQueue({
      name: 'invoice-emission-events',
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
    AuthModule,
    WebviewAuthModule,
    DraftBuilderModule,
    InvoiceEmissionModule,
    CreditNoteModule,
  ],
  providers: [WhatsappInboundProcessor, InvoiceEmissionProcessor],
  exports: [BullModule],
})
export class QueueModule {}
