import { omitEmpty } from '../../common/omit-empty';
import {
  CompradorDraft,
  FinalInvoice,
  FinalInvoiceComprador,
  FinalInvoiceDetalle,
  FormaPago,
  InvoiceSkeleton,
} from './types';

const DEFAULT_FORMA_PAGO = FormaPago.EFECTIVO;

export function assembleInvoice(
  skeleton: InvoiceSkeleton,
  comprador: CompradorDraft,
  detalles: FinalInvoiceDetalle[],
  formaPago?: FormaPago,
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
        // No credit-terms concept yet — every supported forma de pago
        // (efectivo, débito, crédito, transferencia) is immediate payment.
        plazo: 0,
        unidadTiempo: 'dias',
      },
    ],
  };
}
