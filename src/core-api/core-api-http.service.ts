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

  private toTokenSet(data: LoginResponse): CoreApiTokenSet {
    return {
      accessToken: data.accessToken as CoreApiUserToken,
      refreshToken: data.refreshToken,
      expiresAt: new Date(data.expiresAt),
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
      );
    }
    // 401/400 here means bad credentials or an invalid/expired refresh token — retrying won't help.
    return new TerminalCoreApiError(
      `Core API call rejected (status ${status}) for ${context}`,
    );
  }
}
