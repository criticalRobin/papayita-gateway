import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { maskTail } from '../../common/redact';
import { WhatsappClient } from './whatsapp-client.interface';
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
      throw this.mapError(error, to);
    }
  }

  private mapError(error: unknown, to: string): Error {
    if (!(error instanceof AxiosError)) {
      return new RetryableWhatsappError(
        `unexpected error sending to ${maskTail(to)}`,
      );
    }

    const status = error.response?.status;
    this.logger.error(
      `Graph API error body for ${maskTail(to)}: ${JSON.stringify(error.response?.data)}`,
    );
    // No response (network/timeout), 5xx, or 429 rate limit: worth retrying.
    if (status === undefined || status >= 500 || status === 429) {
      return new RetryableWhatsappError(
        `WhatsApp send failed (status ${status ?? 'network'}) for ${maskTail(to)}`,
      );
    }
    return new TerminalWhatsappError(
      `WhatsApp send rejected (status ${status}) for ${maskTail(to)}`,
    );
  }
}
