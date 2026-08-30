import { EmisorProfile } from '../../emisor/emisor-client.interface';
import { InvoiceSkeleton } from './types';

export interface SriConfig {
  ambiente: string;
  tipoEmision: string;
}

export function buildSkeleton(
  emisor: EmisorProfile,
  config: SriConfig,
  fechaEmision: string,
): InvoiceSkeleton {
  return {
    ambiente: config.ambiente,
    tipoEmision: config.tipoEmision,
    fechaEmision,
    emisor,
  };
}
