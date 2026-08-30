import { omitEmpty } from '../../common/omit-empty';
import {
  CompradorDraft,
  FinalInvoice,
  FinalInvoiceComprador,
  FinalInvoiceDetalle,
  InvoiceSkeleton,
} from './types';

const DEFAULT_FORMA_PAGO = '01'; // efectivo

export function assembleInvoice(
  skeleton: InvoiceSkeleton,
  comprador: CompradorDraft,
  detalles: FinalInvoiceDetalle[],
  formaPago?: string,
): FinalInvoice {
  const { verified: _verified, ...compradorFields } = comprador;
  void _verified;

  const total = detalles.reduce(
    (sum, d) => sum + d.cantidad * d.precioUnitario,
    0,
  );

  return {
    ambiente: skeleton.ambiente,
    tipoEmision: skeleton.tipoEmision,
    fechaEmision: skeleton.fechaEmision,
    emisor: skeleton.emisor,
    comprador: omitEmpty(compradorFields) as FinalInvoiceComprador,
    detalles,
    pagos: [
      {
        formaPago: formaPago ?? DEFAULT_FORMA_PAGO,
        total,
        plazo: 1,
        unidadTiempo: 'dias',
      },
    ],
  };
}
