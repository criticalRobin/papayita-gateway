import { parseComprobanteXml } from './parse-comprobante-xml';

// Real (anonymization-safe) sample XML from Core API's
// GET /sri/comprobantes/{claveAcceso}/xml, minus the trailing ds:Signature
// block (irrelevant to parsing — never consumed).
const SAMPLE_FACTURA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>1</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>MATIAS TITE</razonSocial>
    <nombreComercial>NUKAY SW</nombreComercial>
    <ruc>1850137918001</ruc>
    <claveAcceso>1209202601185013791800110010010000000258706914910</claveAcceso>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>000000025</secuencial>
    <dirMatriz>PILLARO</dirMatriz>
    <contribuyenteRimpe>CONTRIBUYENTE RÉGIMEN RIMPE</contribuyenteRimpe>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>12/09/2026</fechaEmision>
    <obligadoContabilidad>NO</obligadoContabilidad>
    <tipoIdentificacionComprador>05</tipoIdentificacionComprador>
    <razonSocialComprador>TITE HARO RAMIRO MATIAS</razonSocialComprador>
    <identificacionComprador>1850137918</identificacionComprador>
    <totalSinImpuestos>559.99</totalSinImpuestos>
    <totalDescuento>0.00</totalDescuento>
    <totalConImpuestos>
      <totalImpuesto>
        <codigo>2</codigo>
        <codigoPorcentaje>4</codigoPorcentaje>
        <baseImponible>559.99</baseImponible>
        <tarifa>15.00</tarifa>
        <valor>84.00</valor>
      </totalImpuesto>
    </totalConImpuestos>
    <importeTotal>643.99</importeTotal>
    <moneda>DOLAR</moneda>
    <pagos>
      <pago>
        <formaPago>19</formaPago>
        <total>559.99</total>
        <plazo>0</plazo>
        <unidadTiempo>dias</unidadTiempo>
      </pago>
    </pagos>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>CONS-PS5-01</codigoPrincipal>
      <codigoAuxiliar>SONY-001</codigoAuxiliar>
      <descripcion>Consola Sony PlayStation 5 sin lector de discos, almacenamiento de 825GB SSD con control DualSense incluido.</descripcion>
      <unidadMedida>Unidad</unidadMedida>
      <cantidad>1.000000</cantidad>
      <precioUnitario>499.990000</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>499.99</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>4</codigoPorcentaje>
          <tarifa>15.00</tarifa>
          <baseImponible>499.99</baseImponible>
          <valor>75.00</valor>
        </impuesto>
      </impuestos>
    </detalle>
    <detalle>
      <codigoPrincipal>PRB124</codigoPrincipal>
      <descripcion>Control Xbox Series S</descripcion>
      <unidadMedida>UNIDAD</unidadMedida>
      <cantidad>1.000000</cantidad>
      <precioUnitario>60.000000</precioUnitario>
      <descuento>0.00</descuento>
      <precioTotalSinImpuesto>60.00</precioTotalSinImpuesto>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>4</codigoPorcentaje>
          <tarifa>15.00</tarifa>
          <baseImponible>60.00</baseImponible>
          <valor>9.00</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>
</factura>`;

describe('parseComprobanteXml', () => {
  it('extracts infoTributaria/infoFactura fields into the flat draft shape', () => {
    const data = parseComprobanteXml(SAMPLE_FACTURA_XML);

    expect(data.ambiente).toBe('1');
    expect(data.tipoEmision).toBe('1');
    expect(data.fechaEmision).toBe('12/09/2026');
    expect(data.secuencial).toBe('000000025');
    expect(data.codDocModificado).toBe('01');
    expect(data.numDocModificado).toBe('001-001-000000025');
    expect(data.fechaEmisionDocSustento).toBe('12/09/2026');
  });

  it('maps dirMatriz to both dirMatriz and the emisor block used for dirEstablecimiento', () => {
    const { emisor } = parseComprobanteXml(SAMPLE_FACTURA_XML);

    expect(emisor).toEqual({
      ruc: '1850137918001',
      razonSocial: 'MATIAS TITE',
      nombreComercial: 'NUKAY SW',
      dirMatriz: 'PILLARO',
      establecimiento: '001',
      puntoEmision: '001',
      obligadoContabilidad: 'NO',
      contribuyenteRimpe: 'CONTRIBUYENTE RÉGIMEN RIMPE',
    });
  });

  it('carries the comprador identification through unchanged, contact fields null (enriched later via persona lookup)', () => {
    const { comprador } = parseComprobanteXml(SAMPLE_FACTURA_XML);

    expect(comprador).toEqual({
      tipoIdentificacion: '05',
      identificacion: '1850137918',
      razonSocial: 'TITE HARO RAMIRO MATIAS',
      direccion: null,
      telefono: null,
      email: null,
    });
  });

  it('parses both detalles with numeric money fields, keeping codigoPrincipal/impuesto codes as strings', () => {
    const { detalles } = parseComprobanteXml(SAMPLE_FACTURA_XML);

    expect(detalles).toHaveLength(2);
    expect(detalles[0]).toEqual({
      codigoPrincipal: 'CONS-PS5-01',
      codigoAuxiliar: 'SONY-001',
      descripcion:
        'Consola Sony PlayStation 5 sin lector de discos, almacenamiento de 825GB SSD con control DualSense incluido.',
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
    });
    expect(detalles[1].codigoAuxiliar).toBeNull();
    expect(detalles[1].precioUnitario).toBe(60);
  });

  it('handles a single-detalle invoice (fast-xml-parser array coercion edge case)', () => {
    const singleDetalleXml = `<?xml version="1.0" encoding="UTF-8"?>
<factura id="comprobante" version="1.1.0">
  <infoTributaria>
    <ambiente>1</ambiente>
    <tipoEmision>1</tipoEmision>
    <razonSocial>MATIAS TITE</razonSocial>
    <ruc>1850137918001</ruc>
    <codDoc>01</codDoc>
    <estab>001</estab>
    <ptoEmi>001</ptoEmi>
    <secuencial>000000025</secuencial>
    <dirMatriz>PILLARO</dirMatriz>
  </infoTributaria>
  <infoFactura>
    <fechaEmision>12/09/2026</fechaEmision>
    <obligadoContabilidad>NO</obligadoContabilidad>
    <tipoIdentificacionComprador>05</tipoIdentificacionComprador>
    <razonSocialComprador>TITE HARO RAMIRO MATIAS</razonSocialComprador>
    <identificacionComprador>1850137918</identificacionComprador>
  </infoFactura>
  <detalles>
    <detalle>
      <codigoPrincipal>CONS-PS5-01</codigoPrincipal>
      <codigoAuxiliar>SONY-001</codigoAuxiliar>
      <descripcion>Consola Sony PlayStation 5</descripcion>
      <cantidad>1.000000</cantidad>
      <precioUnitario>499.990000</precioUnitario>
      <descuento>0.00</descuento>
      <impuestos>
        <impuesto>
          <codigo>2</codigo>
          <codigoPorcentaje>4</codigoPorcentaje>
          <tarifa>15.00</tarifa>
          <baseImponible>499.99</baseImponible>
          <valor>75.00</valor>
        </impuesto>
      </impuestos>
    </detalle>
  </detalles>
</factura>`;

    const { detalles } = parseComprobanteXml(singleDetalleXml);

    expect(detalles).toHaveLength(1);
    expect(detalles[0].codigoPrincipal).toBe('CONS-PS5-01');
  });
});
