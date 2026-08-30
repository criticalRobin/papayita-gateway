import type { CoreApiUserToken } from './core-api-token';

export interface CoreApiTokenSet {
  accessToken: CoreApiUserToken;
  refreshToken: string;
  expiresAt: Date;
  emisorId: string;
}

export interface CoreApiClient {
  login(email: string, password: string): Promise<CoreApiTokenSet>;
  refresh(refreshToken: string): Promise<CoreApiTokenSet>;
  post<T>(path: string, token: CoreApiUserToken, body: unknown): Promise<T>;
  get<T>(path: string, token: CoreApiUserToken): Promise<T>;
}
