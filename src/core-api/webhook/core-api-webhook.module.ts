import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { CoreApiWebhookController } from './core-api-webhook.controller';
import { CoreApiWebhookService } from './core-api-webhook.service';

@Module({
  imports: [QueueModule],
  controllers: [CoreApiWebhookController],
  providers: [CoreApiWebhookService],
})
export class CoreApiWebhookModule {}
