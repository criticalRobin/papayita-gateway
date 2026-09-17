import { Inject, Injectable } from '@nestjs/common';
import { CORE_API_CLIENT } from '../core-api/core-api.module';
import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { PlanGateClient } from './plan-gate-client.interface';
import { PreflightResponse } from './domain/types';

@Injectable()
export class PlanGateHttpService implements PlanGateClient {
  constructor(
    @Inject(CORE_API_CLIENT) private readonly coreApiClient: CoreApiClient,
  ) {}

  async checkPreflight(
    token: CoreApiUserToken,
    ruc: string,
    establecimiento: string,
    puntoEmision: string,
  ): Promise<PreflightResponse> {
    return this.coreApiClient.post<PreflightResponse>('/sri/preflight', token, {
      ruc,
      establecimiento,
      puntoEmision,
    });
  }
}
