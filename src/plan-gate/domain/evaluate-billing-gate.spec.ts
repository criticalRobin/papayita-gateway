import { evaluateBillingGate } from './evaluate-billing-gate';
import { PreflightResponse } from './types';

function makePreflight(
  overrides: Partial<PreflightResponse> = {},
): PreflightResponse {
  return {
    listo: true,
    inventarioModo: 'PERMISIVO',
    certificado: { ok: true, detalle: 'Certificado vinculado y vigente.' },
    puntoEmision: { ok: true, detalle: 'Punto de emisión 001-001 activo.' },
    secuenciales: {
      ok: true,
      detalle: 'Secuenciales inicializados para: 01, 04, 05, 06, 07.',
    },
    bodegaPrincipal: { ok: true, detalle: 'Bodega principal activa.' },
    webhook: {
      ok: true,
      detalle: 'Hay al menos un webhook activo para comprobante.autorizado.',
    },
    stock: {
      ok: true,
      detalle: 'No se enviaron detalles para proyectar stock.',
    },
    plan: { ok: true, detalle: 'Uso 37/50 comprobantes este mes.' },
    planInfo: {
      id: 'de3cd4fc-c6f5-4dfb-874b-e48773898dba',
      nombre: 'PRO',
      limiteComprobantes: 50,
      precioExcedente: 0.2,
    },
    uso: { periodo: '2026-09', comprobantesEmitidos: 37, restantes: 13 },
    permiteExcedente: false,
    lineas: [],
    ...overrides,
  };
}

describe('evaluateBillingGate', () => {
  it('allows billing when listo is true (PRO under limit example)', () => {
    const decision = evaluateBillingGate(makePreflight());
    expect(decision).toEqual({ allowed: true });
  });

  it('blocks with PLAN_LIMIT when only plan.ok is false and permiteExcedente is false (BASICO at limit example)', () => {
    const preflight = makePreflight({
      listo: false,
      plan: {
        ok: false,
        detalle:
          'Límite de 10 comprobantes alcanzado (37 emitidos). Active facturación bajo consumo o actualice el plan para seguir emitiendo.',
      },
      planInfo: {
        id: 'ec9e5017-0ac1-44b4-8d55-7e82ee1aca97',
        nombre: 'BASICO',
        limiteComprobantes: 10,
        precioExcedente: 0.5,
      },
      uso: { periodo: '2026-09', comprobantesEmitidos: 37, restantes: -27 },
      permiteExcedente: false,
    });

    const decision = evaluateBillingGate(preflight);

    expect(decision).toEqual({
      allowed: false,
      reason: 'PLAN_LIMIT',
      detalle: preflight.plan.detalle,
    });
  });

  it('allows billing when only plan.ok is false but permiteExcedente is true', () => {
    const preflight = makePreflight({
      listo: false,
      plan: { ok: false, detalle: 'Límite alcanzado.' },
      permiteExcedente: true,
    });

    expect(evaluateBillingGate(preflight)).toEqual({ allowed: true });
  });

  it('blocks with NOT_READY when a non-plan check fails, regardless of permiteExcedente', () => {
    const preflight = makePreflight({
      listo: false,
      certificado: { ok: false, detalle: 'Certificado vencido.' },
      permiteExcedente: true,
    });

    expect(evaluateBillingGate(preflight)).toEqual({
      allowed: false,
      reason: 'NOT_READY',
      detalle: 'Certificado vencido.',
    });
  });
});
