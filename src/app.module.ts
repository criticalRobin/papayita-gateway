import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation';
import { QueueModule } from './queue/queue.module';
import { WhatsappClientModule } from './whatsapp/client/whatsapp.module';
import { WebhookModule } from './whatsapp/webhook/webhook.module';
import { CoreApiWebhookModule } from './core-api/webhook/core-api-webhook.module';
import { ExtractionModule } from './extraction/extraction.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    QueueModule,
    WhatsappClientModule,
    WebhookModule,
    CoreApiWebhookModule,
    ExtractionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
