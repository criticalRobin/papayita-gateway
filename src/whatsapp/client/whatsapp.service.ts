import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { maskTail } from '../../common/redact';
import { WhatsappClient, WhatsappMedia } from './whatsapp-client.interface';
import {
  RetryableWhatsappError,
  TerminalWhatsappError,
} from './whatsapp.errors';

@Injectable()
export class WhatsappService implements WhatsappClient {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {}

  async sendTextMessage(to: string, body: string): Promise<void> {
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const graphApiVersion = this.config.get<string>('GRAPH_API_VERSION');
    const url = `https://graph.facebook.com/${graphApiVersion}/${phoneNumberId}/messages`;

    try {
      await firstValueFrom(
        this.httpService.post(
          url,
          {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body },
          },
          { headers: { Authorization: `Bearer ${accessToken}` } },
        ),
      );
      this.logger.log(`sent message to ${maskTail(to)}`);
    } catch (error) {
      throw this.mapError(error, maskTail(to));
    }
  }

  async downloadMedia(mediaId: string): Promise<WhatsappMedia> {
    const accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN');
    const graphApiVersion = this.config.get<string>('GRAPH_API_VERSION');
    const authHeader = { headers: { Authorization: `Bearer ${accessToken}` } };
    const context = maskTail(mediaId);

    try {
      const metaResponse = await firstValueFrom(
        this.httpService.get<{ url: string; mime_type: string }>(
          `https://graph.facebook.com/${graphApiVersion}/${mediaId}`,
          authHeader,
        ),
      );
      const { url, mime_type: mimeType } = metaResponse.data;

      const mediaResponse = await firstValueFrom(
        this.httpService.get(url, {
          ...authHeader,
          responseType: 'arraybuffer',
        }),
      );

      return {
        buffer: Buffer.from(mediaResponse.data as ArrayBuffer),
        mimeType,
      };
    } catch (error) {
      throw this.mapError(error, context);
    }
  }

  private mapError(error: unknown, context: string): Error {
    if (!(error instanceof AxiosError)) {
      return new RetryableWhatsappError(`unexpected error for ${context}`);
    }

    const status = error.response?.status;
    this.logger.error(
      `Graph API error body for ${context}: ${JSON.stringify(error.response?.data)}`,
    );
    // No response (network/timeout), 5xx, or 429 rate limit: worth retrying.
    if (status === undefined || status >= 500 || status === 429) {
      return new RetryableWhatsappError(
        `WhatsApp Graph API call failed (status ${status ?? 'network'}) for ${context}`,
      );
    }
    return new TerminalWhatsappError(
      `WhatsApp Graph API call rejected (status ${status}) for ${context}`,
    );
  }
}
