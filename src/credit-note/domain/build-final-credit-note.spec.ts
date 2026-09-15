import { buildFinalCreditNote } from './build-final-credit-note';
import { CreditNoteXmlData, CreditNoteXmlDetalle } from './types';

const xmlData: CreditNoteXmlData = {
  ambiente: '1',
  tipoEmision: '1',
  fechaEmision: '12/09/2026',
  secuencial: '000000025',
  emisor: {
    ruc: '1850137918001',
    razonSocial: 'MATIAS TITE',
    nombreComercial: 'NUKAY SW',
    dirMatriz: 'PILLARO',
    establecimiento: '001',
    puntoEmision: '001',
    obligadoContabilidad: 'NO',
    contribuyenteRimpe: 'CONTRIBUYENTE RÉGIMEN RIMPE',
  },
  comprador: {
    tipoIdentificacion: '05',
    identificacion: '1850137918',
    razonSocial: 'TITE HARO RAMIRO MATIAS',
    direccion: null,
    telefono: null,
    email: null,
  },
  codDocModificado: '01',
  numDocModificado: '001-001-000000025',
  fechaEmisionDocSustento: '12/09/2026',
  detalles: [],
};

const detalle: CreditNoteXmlDetalle = {
  codigoPrincipal: 'CONS-PS5-01',
  codigoAuxiliar: 'SONY-001',
  descripcion: 'Consola Sony PlayStation 5',
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

describe('buildFinalCreditNote', () => {
  it('never includes fechaEmision or secuencial', () => {
    const result = buildFinalCreditNote(xmlData, [detalle], {
      motivo: 'Devolución de consola',
    });

    expect(result).not.toHaveProperty('fechaEmision');
    expect(result).not.toHaveProperty('secuencial');
  });

  it('sets dirEstablecimiento to dirMatriz', () => {
    const result = buildFinalCreditNote(xmlData, [detalle], {
      motivo: 'Devolución de consola',
    });

    expect(result.emisor.dirEstablecimiento).toBe('PILLARO');
    expect(result.emisor.dirMatriz).toBe('PILLARO');
  });

  it('uses the XML comprador/razonSocial by default, overridable from the webview', () => {
    const defaultResult = buildFinalCreditNote(xmlData, [detalle], {
      motivo: 'Devolución de consola',
    });
    expect(defaultResult.comprador.razonSocial).toBe('TITE HARO RAMIRO MATIAS');

    const overriddenResult = buildFinalCreditNote(xmlData, [detalle], {
      motivo: 'Devolución de consola',
      razonSocial: 'Nombre editado en el webview',
      comprador: { email: 'cliente@ejemplo.com' },
    });
    expect(overriddenResult.comprador.razonSocial).toBe(
      'Nombre editado en el webview',
    );
    expect(overriddenResult.comprador.email).toBe('cliente@ejemplo.com');
  });

  it('carries codDocModificado/numDocModificado/fechaEmisionDocSustento straight from the XML', () => {
    const result = buildFinalCreditNote(xmlData, [detalle], {
      motivo: 'Devolución de consola',
    });

    expect(result.codDocModificado).toBe('01');
    expect(result.numDocModificado).toBe('001-001-000000025');
    expect(result.fechaEmisionDocSustento).toBe('12/09/2026');
  });

  it('passes the selected detalles through unchanged (money fields already server-sourced)', () => {
    const result = buildFinalCreditNote(xmlData, [detalle], {
      motivo: 'Devolución de consola',
    });

    expect(result.detalles).toEqual([detalle]);
  });
});
