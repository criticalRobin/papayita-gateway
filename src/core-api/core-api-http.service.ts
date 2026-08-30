import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { maskTail } from '../common/redact';
import { CoreApiClient, CoreApiTokenSet } from './core-api-client.interface';
import type { CoreApiUserToken } from './core-api-token';
import { RetryableCoreApiError, TerminalCoreApiError } from './core-api.errors';

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: { emisorId: string };
}

@Injectable()
export class CoreApiHttpService implements CoreApiClient {
  private readonly logger = new Logger(CoreApiHttpService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.getOrThrow<string>('CORE_API_BASE_URL');
  }

  async login(email: string, password: string): Promise<CoreApiTokenSet> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<LoginResponse>(`${this.baseUrl}/auth/login`, {
          email,
          password,
        }),
      );
      return this.toTokenSet(data);
    } catch (error) {
      throw this.mapError(error, `login ${maskTail(email)}`);
    }
  }

  async refresh(refreshToken: string): Promise<CoreApiTokenSet> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<LoginResponse>(`${this.baseUrl}/auth/refresh`, {
          refreshToken,
        }),
      );
      return this.toTokenSet(data);
    } catch (error) {
      throw this.mapError(error, 'refresh');
    }
  }

  async post<T>(
    path: string,
    token: CoreApiUserToken,
    body: unknown,
  ): Promise<T> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.post<T>(`${this.baseUrl}${path}`, body, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return data;
    } catch (error) {
      throw this.mapError(error, `POST ${path}`);
    }
  }

  async get<T>(path: string, token: CoreApiUserToken): Promise<T> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<T>(`${this.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      return data;
    } catch (error) {
      throw this.mapError(error, `GET ${path}`);
    }
  }

  async getBinary(path: string, token: CoreApiUserToken): Promise<Buffer> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'arraybuffer',
        }),
      );
      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      throw this.mapError(error, `GET ${path}`);
    }
  }

  private toTokenSet(data: LoginResponse): CoreApiTokenSet {
    return {
      accessToken: data.accessToken as CoreApiUserToken,
      refreshToken: data.refreshToken,
      expiresAt: new Date(data.expiresAt),
      emisorId: data.user.emisorId,
    };
  }

  private mapError(error: unknown, context: string): Error {
    if (!(error instanceof AxiosError)) {
      return new RetryableCoreApiError(`unexpected error for ${context}`);
    }

    const status = error.response?.status;
    this.logger.error(
      `Core API error body for ${context}: ${JSON.stringify(error.response?.data)}`,
    );
    // No response (network/timeout), 5xx, or 429 rate limit: worth retrying.
    if (status === undefined || status >= 500 || status === 429) {
      return new RetryableCoreApiError(
        `Core API call failed (status ${status ?? 'network'}) for ${context}`,
        status,
      );
    }
    // 401/400/404 here means bad credentials, invalid input, or not-found — retrying won't help.
    return new TerminalCoreApiError(
      `Core API call rejected (status ${status}) for ${context}`,
      status,
    );
  }
}
