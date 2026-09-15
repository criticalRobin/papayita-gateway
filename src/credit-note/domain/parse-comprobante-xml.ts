import { XMLParser } from 'fast-xml-parser';
import type { ImpuestoDetalle } from '../../catalog/catalog-search.interface';
import {
  CreditNoteXmlComprador,
  CreditNoteXmlData,
  CreditNoteXmlDetalle,
  CreditNoteXmlEmisor,
} from './types';

// Tag values are parsed as strings only — SRI fields like secuencial/estab/
// ptoEmi/codDoc carry meaningful leading zeros ("000000025", "001") that
// fast-xml-parser's default numeric coercion would silently strip. Only the
// handful of genuinely numeric fields (cantidad, precioUnitario, tarifa,
// baseImponible, valor, descuento) are converted explicitly below.
const parser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (tagName) => tagName === 'detalle' || tagName === 'impuesto',
});

interface RawImpuesto {
  codigo: string;
  codigoPorcentaje: string;
  tarifa: string;
  baseImponible: string;
  valor: string;
}

interface RawDetalle {
  codigoPrincipal: string;
  codigoAuxiliar?: string;
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  descuento: string;
  impuestos: { impuesto: RawImpuesto[] };
}

interface RawInfoTributaria {
  ambiente: string;
  tipoEmision: string;
  razonSocial: string;
  nombreComercial?: string;
  ruc: string;
  codDoc: string;
  estab: string;
  ptoEmi: string;
  secuencial: string;
  dirMatriz: string;
  contribuyenteRimpe?: string;
}

interface RawInfoFactura {
  fechaEmision: string;
  obligadoContabilidad: 'SI' | 'NO';
  tipoIdentificacionComprador: string;
  razonSocialComprador: string;
  identificacionComprador: string;
}

interface RawFactura {
  factura: {
    infoTributaria: RawInfoTributaria;
    infoFactura: RawInfoFactura;
    detalles: { detalle: RawDetalle[] };
  };
}

function toImpuesto(raw: RawImpuesto): ImpuestoDetalle {
  return {
    codigo: raw.codigo,
    codigoPorcentaje: raw.codigoPorcentaje,
    tarifa: Number(raw.tarifa),
    baseImponible: Number(raw.baseImponible),
    valor: Number(raw.valor),
  };
}

function toDetalle(raw: RawDetalle): CreditNoteXmlDetalle {
  return {
    codigoPrincipal: raw.codigoPrincipal,
    codigoAuxiliar: raw.codigoAuxiliar ?? null,
    descripcion: raw.descripcion,
    cantidad: Number(raw.cantidad),
    precioUnitario: Number(raw.precioUnitario),
    descuento: Number(raw.descuento),
    impuestos: raw.impuestos.impuesto.map(toImpuesto),
  };
}

function toEmisor(raw: RawInfoTributaria): CreditNoteXmlEmisor {
  return {
    ruc: raw.ruc,
    razonSocial: raw.razonSocial,
    nombreComercial: raw.nombreComercial ?? null,
    // dirEstablecimiento isn't present on the factura XML — the gateway
    // uses dirMatriz for both, per explicit product decision.
    dirMatriz: raw.dirMatriz,
    establecimiento: raw.estab,
    puntoEmision: raw.ptoEmi,
    obligadoContabilidad: 'NO', // overwritten by infoFactura below
    contribuyenteRimpe: raw.contribuyenteRimpe ?? null,
  };
}

function toComprador(raw: RawInfoFactura): CreditNoteXmlComprador {
  return {
    tipoIdentificacion: raw.tipoIdentificacionComprador,
    identificacion: raw.identificacionComprador,
    razonSocial: raw.razonSocialComprador,
    // Not present on the factura XML — enriched from PersonaLookupClient by
    // credit-note.service.ts, same as draft-builder's mergeComprador.
    direccion: null,
    telefono: null,
    email: null,
  };
}

export function parseComprobanteXml(xml: string): CreditNoteXmlData {
  const parsed = parser.parse(xml) as RawFactura;
  const { infoTributaria, infoFactura, detalles } = parsed.factura;

  const emisor = toEmisor(infoTributaria);
  emisor.obligadoContabilidad = infoFactura.obligadoContabilidad;

  const numDocModificado = `${infoTributaria.estab}-${infoTributaria.ptoEmi}-${infoTributaria.secuencial}`;

  return {
    ambiente: infoTributaria.ambiente,
    tipoEmision: infoTributaria.tipoEmision,
    fechaEmision: infoFactura.fechaEmision,
    secuencial: infoTributaria.secuencial,
    emisor,
    comprador: toComprador(infoFactura),
    codDocModificado: infoTributaria.codDoc,
    numDocModificado,
    fechaEmisionDocSustento: infoFactura.fechaEmision,
    detalles: detalles.detalle.map(toDetalle),
  };
}
