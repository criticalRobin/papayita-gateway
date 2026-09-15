import { buildSkeleton, SriConfig } from './build-skeleton';
import { EmisorProfile } from '../../emisor/emisor-client.interface';

const emisor: EmisorProfile = {
  ruc: '1850137918001',
  razonSocial: 'Mati Prueba',
  nombreComercial: 'Nukay',
  dirMatriz: 'Pillaro',
  establecimiento: '001',
  puntoEmision: '001',
  obligadoContabilidad: 'SI',
  contribuyenteEspecial: 'NO',
  agenteRetencion: 'NO',
  contribuyenteRimpe: null,
};

const config: SriConfig = {
  ambiente: '1',
  tipoEmision: '1',
};

describe('buildSkeleton', () => {
  it('assembles the skeleton from the emisor profile, SRI config, and fechaEmision', () => {
    const skeleton = buildSkeleton(emisor, config, '05/08/2026');

    expect(skeleton).toEqual({
      ambiente: '1',
      tipoEmision: '1',
      fechaEmision: '05/08/2026',
      emisor,
    });
  });
});
