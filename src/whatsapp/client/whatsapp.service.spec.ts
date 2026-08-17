import type { HttpService } from '@nestjs/axios';
import type { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosHeaders } from 'axios';
import { of, throwError } from 'rxjs';
import {
  RetryableWhatsappError,
  TerminalWhatsappError,
} from './whatsapp.errors';
import { WhatsappService } from './whatsapp.service';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function axiosError(status: number): AxiosError {
  return new AxiosError('Request failed', undefined, undefined, undefined, {
    status,
    statusText: 'error',
    data: { error: 'bad request' },
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  });
}

describe('WhatsappService', () => {
  const config = makeConfig({
    WHATSAPP_ACCESS_TOKEN: 'token',
    WHATSAPP_PHONE_NUMBER_ID: 'phone-id',
    GRAPH_API_VERSION: 'v21.0',
  });

  describe('downloadMedia', () => {
    it('fetches the media URL then the raw bytes', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(
          of({ data: { url: 'https://cdn/media', mime_type: 'audio/ogg' } }),
        )
        .mockReturnValueOnce(
          of({ data: Buffer.from('audio-bytes') as unknown as ArrayBuffer }),
        );
      const httpService = { get } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      const result = await service.downloadMedia('media-1');

      expect(result.mimeType).toBe('audio/ogg');
      expect(Buffer.from(result.buffer).toString()).toBe('audio-bytes');
      expect(get).toHaveBeenNthCalledWith(
        1,
        'https://graph.facebook.com/v21.0/media-1',
        { headers: { Authorization: 'Bearer token' } },
      );
      expect(get).toHaveBeenNthCalledWith(2, 'https://cdn/media', {
        headers: { Authorization: 'Bearer token' },
        responseType: 'arraybuffer',
      });
    });

    it('maps a 5xx failure to RetryableWhatsappError', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(500)));
      const httpService = { get } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      await expect(service.downloadMedia('media-1')).rejects.toThrow(
        RetryableWhatsappError,
      );
    });

    it('maps a network error (no response) to RetryableWhatsappError', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(
          throwError(() => new AxiosError('timeout', 'ECONNABORTED')),
        );
      const httpService = { get } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      await expect(service.downloadMedia('media-1')).rejects.toThrow(
        RetryableWhatsappError,
      );
    });

    it('maps a 4xx failure to TerminalWhatsappError', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(404)));
      const httpService = { get } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      await expect(service.downloadMedia('media-1')).rejects.toThrow(
        TerminalWhatsappError,
      );
    });

    it('maps a failure on the second (byte-fetch) call the same way', async () => {
      const get = jest
        .fn()
        .mockReturnValueOnce(
          of({ data: { url: 'https://cdn/media', mime_type: 'audio/ogg' } }),
        )
        .mockReturnValueOnce(throwError(() => axiosError(500)));
      const httpService = { get } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      await expect(service.downloadMedia('media-1')).rejects.toThrow(
        RetryableWhatsappError,
      );
    });
  });

  describe('sendTextMessage', () => {
    it('posts the message to the Graph API', async () => {
      const post = jest.fn().mockReturnValueOnce(of({ data: {} }));
      const httpService = { post } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      await service.sendTextMessage('5219999999999', 'hola');

      expect(post).toHaveBeenCalledWith(
        'https://graph.facebook.com/v21.0/phone-id/messages',
        {
          messaging_product: 'whatsapp',
          to: '5219999999999',
          type: 'text',
          text: { body: 'hola' },
        },
        { headers: { Authorization: 'Bearer token' } },
      );
    });

    it('maps a 5xx failure to RetryableWhatsappError', async () => {
      const post = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(503)));
      const httpService = { post } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      await expect(
        service.sendTextMessage('5219999999999', 'hola'),
      ).rejects.toThrow(RetryableWhatsappError);
    });

    it('maps a 4xx failure to TerminalWhatsappError', async () => {
      const post = jest
        .fn()
        .mockReturnValueOnce(throwError(() => axiosError(401)));
      const httpService = { post } as unknown as HttpService;
      const service = new WhatsappService(httpService, config);

      await expect(
        service.sendTextMessage('5219999999999', 'hola'),
      ).rejects.toThrow(TerminalWhatsappError);
    });
  });
});
