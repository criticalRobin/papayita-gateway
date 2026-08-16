import { Module } from '@nestjs/common';
import { QueueModule } from '../../queue/queue.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [QueueModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
