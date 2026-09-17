import type { CoreApiClient } from '../core-api/core-api-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { PlanGateHttpService } from './plan-gate-http.service';
import { PreflightResponse } from './domain/types';

function makeCoreApiClient(post: jest.Mock): CoreApiClient {
  return { post } as unknown as CoreApiClient;
}

describe('PlanGateHttpService', () => {
  const token = 'access-1' as CoreApiUserToken;

  it('posts ruc/establecimiento/puntoEmision to /sri/preflight', async () => {
    const preflightResponse = { listo: true } as unknown as PreflightResponse;
    const post = jest.fn().mockResolvedValue(preflightResponse);
    const service = new PlanGateHttpService(makeCoreApiClient(post));

    const result = await service.checkPreflight(
      token,
      '1850137918001',
      '001',
      '001',
    );

    expect(post).toHaveBeenCalledWith('/sri/preflight', token, {
      ruc: '1850137918001',
      establecimiento: '001',
      puntoEmision: '001',
    });
    expect(result).toBe(preflightResponse);
  });
});
