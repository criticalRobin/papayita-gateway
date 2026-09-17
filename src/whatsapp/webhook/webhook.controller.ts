import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
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
    // Typed `unknown` (not the DTO class) so the app-wide forbidNonWhitelisted
    // ValidationPipe (main.ts) skips this param instead of double-validating it —
    // webhookService.parsePayload does the (relaxed) validation itself. Meta's
    // payload grows new fields/message types over time; we whitelist+strip
    // instead of rejecting, so schema drift on their side doesn't 400 a webhook
    // Meta expects a fast 2xx from.
    @Body() rawPayload: unknown,
  ): Promise<{ status: string }> {
    this.webhookService.verifySignature(req.rawBody, signature);
    const payload = await this.webhookService.parsePayload(rawPayload);
    await this.webhookService.handlePayload(payload);
    return { status: 'ok' };
  }
}
