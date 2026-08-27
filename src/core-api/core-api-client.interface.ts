import type { CoreApiUserToken } from './core-api-token';

export interface CoreApiTokenSet {
  accessToken: CoreApiUserToken;
  refreshToken: string;
  expiresAt: Date;
}

export interface CoreApiClient {
  login(email: string, password: string): Promise<CoreApiTokenSet>;
  refresh(refreshToken: string): Promise<CoreApiTokenSet>;
}
