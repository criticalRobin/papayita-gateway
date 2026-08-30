import { assembleInvoice } from './assemble-invoice';
import { CompradorDraft, FinalInvoiceDetalle, InvoiceSkeleton } from './types';

const skeleton: InvoiceSkeleton = {
  ambiente: '1',
  tipoEmision: '1',
  fechaEmision: '05/08/2026',
  emisor: {
    ruc: '1850137918001',
    razonSocial: 'Mati Prueba',
    nombreComercial: 'Nukay',
    dirMatriz: 'Pillaro',
    dirEstablecimiento: 'Ninguna',
    establecimiento: '001',
    puntoEmision: '001',
    obligadoContabilidad: 'SI',
    contribuyenteEspecial: 'NO',
    agenteRetencion: 'NO',
  },
};

const comprador: CompradorDraft = {
  tipoIdentificacion: '05',
  identificacion: '1850137918',
  razonSocial: 'Matias Tite',
  direccion: null,
  telefono: null,
  email: 'matiastite1@gmail.com',
  verified: true,
};

const validDetalle: FinalInvoiceDetalle = {
  codigoPrincipal: 'CONS-PS5-01',
  codigoAuxiliar: 'SONY-001',
  descripcion: 'Consola PlayStation 5',
  unidadMedida: 'Unidad',
  cantidad: 1,
  precioUnitario: 499.99,
  descuento: 0,
  impuestos: [
    {
      codigo: '2',
      codigoPorcentaje: '4',
      tarifa: 15,
      baseImponible: 499.99,
      valor: 75,
    },
  ],
};

describe('assembleInvoice', () => {
  it('assembles a full invoice with no secuencial key, passing detalles (with impuestos) through as-is', () => {
    const invoice = assembleInvoice(skeleton, comprador, [validDetalle], '01');

    expect(invoice).not.toHaveProperty('secuencial');
    expect(invoice.detalles[0].impuestos).toEqual(validDetalle.impuestos);
  });

  it('omits null/undefined comprador fields instead of sending them as null', () => {
    const invoice = assembleInvoice(skeleton, comprador, [validDetalle]);

    expect(invoice.comprador).not.toHaveProperty('direccion');
    expect(invoice.comprador).not.toHaveProperty('telefono');
    expect(invoice.comprador).not.toHaveProperty('verified');
    expect(invoice.comprador.email).toBe('matiastite1@gmail.com');
  });

  it('computes pagos.total from cantidad * precioUnitario across all detalles', () => {
    const invoice = assembleInvoice(
      skeleton,
      comprador,
      [validDetalle, { ...validDetalle, cantidad: 2, precioUnitario: 15.99 }],
      '01',
    );

    expect(invoice.pagos).toEqual([
      {
        formaPago: '01',
        total: 499.99 + 2 * 15.99,
        plazo: 1,
        unidadTiempo: 'dias',
      },
    ]);
  });

  it('defaults formaPago to "01" (efectivo) when not provided', () => {
    const invoice = assembleInvoice(skeleton, comprador, [validDetalle]);
    expect(invoice.pagos[0].formaPago).toBe('01');
  });
});
