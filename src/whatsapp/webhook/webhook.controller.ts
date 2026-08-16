import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  ValidationPipe,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { WhatsappWebhookPayloadDto } from './dto/whatsapp-webhook.dto';
import { WebhookService } from './webhook.service';

@Controller('webhook/whatsapp')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    return this.webhookService.verifyChallenge(mode, token, challenge);
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    // Meta's payload grows new fields/message types over time — whitelist+strip here instead of
    // the app-wide forbidNonWhitelisted, so schema drift on their side doesn't 400 a webhook Meta expects fast 2xx from.
    @Body(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    )
    payload: WhatsappWebhookPayloadDto,
  ): Promise<{ status: string }> {
    this.webhookService.verifySignature(req.rawBody, signature);
    await this.webhookService.handlePayload(payload);
    return { status: 'ok' };
  }
}
