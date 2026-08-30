import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  ValidationPipe,
} from '@nestjs/common';
import { CoreApiWebhookDto } from './dto/core-api-webhook.dto';
import { CoreApiWebhookService } from './core-api-webhook.service';

// No signature/secret verification yet — Core API doesn't support one on this endpoint
// today. Confirmed with the team; revisit before accepting real customer traffic.
@Controller('webhook/core-api')
export class CoreApiWebhookController {
  private readonly logger = new Logger(CoreApiWebhookController.name);
  private warnedNoAuth = false;

  constructor(private readonly webhookService: CoreApiWebhookService) {}

  @Post()
  @HttpCode(200)
  async receive(
    @Body(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false }))
    payload: CoreApiWebhookDto,
  ): Promise<{ status: string }> {
    if (!this.warnedNoAuth) {
      this.logger.warn(
        'Core API webhook has no signature/secret verification — accepting any POST. Set one up before accepting real customer traffic.',
      );
      this.warnedNoAuth = true;
    }
    await this.webhookService.handlePayload(payload);
    return { status: 'ok' };
  }
}
