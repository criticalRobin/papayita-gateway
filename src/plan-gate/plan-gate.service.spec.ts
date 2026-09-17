import { UnauthorizedException } from '@nestjs/common';
import type { AuthService } from '../auth/auth.service';
import type { EmisorClient } from '../emisor/emisor-client.interface';
import type { CoreApiUserToken } from '../core-api/core-api-token';
import { PlanGateService } from './plan-gate.service';
import { PlanGateClient } from './plan-gate-client.interface';
import { PreflightResponse } from './domain/types';

const token = 'access-1' as CoreApiUserToken;

function makeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  return {
    getValidToken: jest.fn().mockResolvedValue(token),
    getEmisorId: jest.fn().mockResolvedValue('emisor-1'),
    ...overrides,
  } as unknown as AuthService;
}

function makeEmisorClient(
  getProfile: jest.Mock = jest.fn().mockResolvedValue({
    ruc: '1850137918001',
    establecimiento: '001',
    puntoEmision: '001',
  }),
): EmisorClient {
  return { getProfile };
}

function makePreflight(
  overrides: Partial<PreflightResponse> = {},
): PreflightResponse {
  const okCheck = { ok: true, detalle: 'ok' };
  return {
    listo: true,
    inventarioModo: 'PERMISIVO',
    certificado: okCheck,
    puntoEmision: okCheck,
    secuenciales: okCheck,
    bodegaPrincipal: okCheck,
    webhook: okCheck,
    stock: okCheck,
    plan: okCheck,
    planInfo: {
      id: 'de3cd4fc-c6f5-4dfb-874b-e48773898dba',
      nombre: 'PRO',
      limiteComprobantes: 50,
      precioExcedente: 0.2,
    },
    uso: { periodo: '2026-09', comprobantesEmitidos: 1, restantes: 49 },
    permiteExcedente: false,
    lineas: [],
    ...overrides,
  };
}

describe('PlanGateService', () => {
  it('resolves ruc/establecimiento/puntoEmision and calls preflight for assertBillingAllowed', async () => {
    const checkPreflight = jest.fn().mockResolvedValue(makePreflight());
    const planGateClient: PlanGateClient = { checkPreflight };
    const getProfile = jest.fn().mockResolvedValue({
      ruc: '1850137918001',
      establecimiento: '001',
      puntoEmision: '001',
    });
    const service = new PlanGateService(
      makeAuthService(),
      makeEmisorClient(getProfile),
      planGateClient,
    );

    await service.assertBillingAllowed('+593999999999');

    expect(getProfile).toHaveBeenCalledWith(token, 'emisor-1');
    expect(checkPreflight).toHaveBeenCalledWith(
      token,
      '1850137918001',
      '001',
      '001',
    );
  });

  it('throws PlanGateBlockedError(PLAN_LIMIT) when the limit is reached and no overage is allowed', async () => {
    const planGateClient: PlanGateClient = {
      checkPreflight: jest.fn().mockResolvedValue(
        makePreflight({
          listo: false,
          plan: { ok: false, detalle: 'Límite alcanzado.' },
          permiteExcedente: false,
        }),
      ),
    };
    const service = new PlanGateService(
      makeAuthService(),
      makeEmisorClient(),
      planGateClient,
    );

    await expect(
      service.assertBillingAllowed('+593999999999'),
    ).rejects.toMatchObject({ reason: 'PLAN_LIMIT' });
  });

  it('does not throw when the limit is reached but permiteExcedente is true', async () => {
    const planGateClient: PlanGateClient = {
      checkPreflight: jest.fn().mockResolvedValue(
        makePreflight({
          listo: false,
          plan: { ok: false, detalle: 'Límite alcanzado.' },
          permiteExcedente: true,
        }),
      ),
    };
    const service = new PlanGateService(
      makeAuthService(),
      makeEmisorClient(),
      planGateClient,
    );

    await expect(
      service.assertBillingAllowed('+593999999999'),
    ).resolves.toBeUndefined();
  });

  it('throws PlanGateBlockedError(FEATURE_NOT_IN_PLAN) when the plan tier lacks the feature', async () => {
    const planGateClient: PlanGateClient = {
      checkPreflight: jest.fn().mockResolvedValue(
        makePreflight({
          planInfo: {
            id: 'ec9e5017-0ac1-44b4-8d55-7e82ee1aca97',
            nombre: 'BASICO',
            limiteComprobantes: 10,
            precioExcedente: 0.5,
          },
        }),
      ),
    };
    const service = new PlanGateService(
      makeAuthService(),
      makeEmisorClient(),
      planGateClient,
    );

    await expect(
      service.assertFeatureAllowed('+593999999999', 'CREDIT_NOTE'),
    ).rejects.toMatchObject({ reason: 'FEATURE_NOT_IN_PLAN' });
  });

  it('throws UnauthorizedException when there is no valid token/emisorId', async () => {
    const planGateClient: PlanGateClient = { checkPreflight: jest.fn() };
    const service = new PlanGateService(
      makeAuthService({ getValidToken: jest.fn().mockResolvedValue(null) }),
      makeEmisorClient(),
      planGateClient,
    );

    await expect(
      service.assertBillingAllowed('+593999999999'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
