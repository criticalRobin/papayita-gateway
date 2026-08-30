import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import FormData from 'form-data';
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
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    const graphApiVersion = this.config.get<string>('GRAPH_API_VERSION');
    this.accessToken = this.config.get<string>('WHATSAPP_ACCESS_TOKEN') || '';
    this.phoneNumberId =
      this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID') || '';
    this.baseUrl = `https://graph.facebook.com/${graphApiVersion}`;
  }

  async sendTextMessage(to: string, body: string): Promise<void> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

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
          { headers: { Authorization: `Bearer ${this.accessToken}` } },
        ),
      );
      this.logger.log(`sent message to ${maskTail(to)}`);
    } catch (error) {
      throw this.mapError(error, maskTail(to));
    }
  }

  async sendCtaMessage(
    to: string,
    bodyText: string,
    buttonText: string,
    url: string,
  ): Promise<void> {
    const endpoint = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    try {
      await firstValueFrom(
        this.httpService.post(
          endpoint,
          {
            messaging_product: 'whatsapp',
            to,
            type: 'interactive',
            interactive: {
              type: 'cta_url',
              body: { text: bodyText },
              action: {
                name: 'cta_url',
                parameters: { display_text: buttonText, url },
              },
            },
          },
          { headers: { Authorization: `Bearer ${this.accessToken}` } },
        ),
      );
      this.logger.log(`sent CTA message to ${maskTail(to)}`);
    } catch (error) {
      throw this.mapError(error, maskTail(to));
    }
  }

  async downloadMedia(mediaId: string): Promise<WhatsappMedia> {
    const authHeader = {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    };
    const context = maskTail(mediaId);

    try {
      const metaResponse = await firstValueFrom(
        this.httpService.get<{ url: string; mime_type: string }>(
          `${this.baseUrl}/${mediaId}`,
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

  async uploadMedia(
    buffer: Buffer,
    mimeType: string,
    filename: string,
  ): Promise<string> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/media`;
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', mimeType);
    form.append('file', buffer, { filename, contentType: mimeType });

    try {
      const { data } = await firstValueFrom(
        this.httpService.post<{ id: string }>(url, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${this.accessToken}`,
          },
        }),
      );
      this.logger.log(`uploaded media ${maskTail(data.id)}`);
      return data.id;
    } catch (error) {
      throw this.mapError(error, 'uploadMedia');
    }
  }

  async sendDocumentMessage(
    to: string,
    mediaId: string,
    filename: string,
    caption?: string,
  ): Promise<void> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    try {
      await firstValueFrom(
        this.httpService.post(
          url,
          {
            messaging_product: 'whatsapp',
            to,
            type: 'document',
            document: { id: mediaId, filename, caption },
          },
          { headers: { Authorization: `Bearer ${this.accessToken}` } },
        ),
      );
      this.logger.log(`sent document message to ${maskTail(to)}`);
    } catch (error) {
      throw this.mapError(error, maskTail(to));
    }
  }

  async markAsRead(messageId: string): Promise<void> {
    const url = `${this.baseUrl}/${this.phoneNumberId}/messages`;

    try {
      await firstValueFrom(
        this.httpService.post(
          url,
          {
            messaging_product: 'whatsapp',
            status: 'read',
            message_id: messageId,
            typing_indicator: { type: 'text' },
          },
          { headers: { Authorization: `Bearer ${this.accessToken}` } },
        ),
      );
      this.logger.log(`marked message ${maskTail(messageId)} as read`);
    } catch (error) {
      throw this.mapError(error, maskTail(messageId));
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
