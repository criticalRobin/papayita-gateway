import type { CoreApiUserToken } from '../core-api/core-api-token';

export interface EmisorProfile {
  ruc: string;
  razonSocial: string;
  nombreComercial: string | null;
  dirMatriz: string;
  establecimiento: string;
  puntoEmision: string;
  obligadoContabilidad: string | null;
  contribuyenteEspecial: string | null;
  agenteRetencion: string | null;
  contribuyenteRimpe: string | null;
}

export interface EmisorClient {
  getProfile(token: CoreApiUserToken, emisorId: string): Promise<EmisorProfile>;
}
