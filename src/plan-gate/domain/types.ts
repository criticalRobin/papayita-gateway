export type PlanName = 'BASICO' | 'MEDIO' | 'PRO' | 'ULTIMATE';

export type UseCase =
  'BILLING' | 'CREDIT_NOTE' | 'PRODUCT_MANAGEMENT' | 'PURCHASE_REGISTRATION';

export interface PreflightCheck {
  ok: boolean;
  detalle: string;
}

export interface PreflightPlanInfo {
  id: string;
  nombre: PlanName;
  limiteComprobantes: number;
  precioExcedente: number;
}

export interface PreflightUso {
  periodo: string;
  comprobantesEmitidos: number;
  restantes: number;
}

// Shape of POST /sri/preflight's response. `lineas` is passed through
// untouched — it's only relevant to stock projection, which this module
// doesn't consume.
export interface PreflightResponse {
  listo: boolean;
  inventarioModo: string;
  certificado: PreflightCheck;
  puntoEmision: PreflightCheck;
  secuenciales: PreflightCheck;
  bodegaPrincipal: PreflightCheck;
  webhook: PreflightCheck;
  stock: PreflightCheck;
  plan: PreflightCheck;
  planInfo: PreflightPlanInfo;
  uso: PreflightUso;
  permiteExcedente: boolean;
  lineas: unknown[];
}
