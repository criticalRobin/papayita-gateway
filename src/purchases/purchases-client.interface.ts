import type { CoreApiUserToken } from '../core-api/core-api-token';

export interface PurchaseTotalDetail {
  codigo: string;
  codigoPorcentaje: string;
  baseImponible: number;
  tarifa: number;
  valor: number;
}

export interface PurchaseRegisteredResponse {
  id: string;
  emisorId: string;
  proveedorRuc: string;
  proveedorRazonSocial: string;
  tipoComprobante: string;
  establecimiento: string;
  puntoEmision: string;
  secuencial: string;
  claveAcceso: string;
  fechaEmision: string;
  totalSinImpuestos: number;
  importeTotal: number;
  moneda: string;
  totales: PurchaseTotalDetail[];
  createdAt: string;
}

export interface PurchasesClient {
  registrarXml(
    token: CoreApiUserToken,
    xml: string,
  ): Promise<PurchaseRegisteredResponse>;
}
