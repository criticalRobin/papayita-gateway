import { deriveTipoIdentificacion, mergeComprador } from './merge-comprador';

describe('deriveTipoIdentificacion', () => {
  it('returns "05" for a 10-digit cédula', () => {
    expect(deriveTipoIdentificacion('1850137918')).toBe('05');
  });

  it('returns "04" for a 13-digit RUC', () => {
    expect(deriveTipoIdentificacion('1850137918001')).toBe('04');
  });

  it('returns null for a garbage-length identificacion', () => {
    expect(deriveTipoIdentificacion('123')).toBeNull();
  });

  it('returns null when identificacion is null', () => {
    expect(deriveTipoIdentificacion(null)).toBeNull();
  });
});

describe('mergeComprador', () => {
  const extracted = {
    tipoIdentificacion: null,
    identificacion: '1850137918',
  };

  it('prefers the persona record when found, and marks verified: true', () => {
    const persona = {
      id: 'p1',
      tipoIdentificacion: '05',
      identificacion: '1850137918',
      razonSocial: 'TITE HARO RAMIRO MATIAS',
      direccion: 'Pillaro',
      telefono: null,
      email: null,
    };

    const result = mergeComprador(extracted, persona);

    expect(result).toEqual({
      tipoIdentificacion: '05',
      identificacion: '1850137918',
      razonSocial: 'TITE HARO RAMIRO MATIAS',
      direccion: 'Pillaro',
      telefono: null,
      email: null,
      verified: true,
    });
  });

  it('falls back to the LLM guess with verified: false when persona is null (cédula length)', () => {
    const result = mergeComprador(extracted, null);

    expect(result).toEqual({
      tipoIdentificacion: '05',
      identificacion: '1850137918',
      razonSocial: null,
      direccion: null,
      telefono: null,
      email: null,
      verified: false,
    });
  });

  it('sets razonSocial to CONSUMIDOR FINAL and verified: true when identificacion is 9999999999999', () => {
    const result = mergeComprador(
      { tipoIdentificacion: null, identificacion: '9999999999999' },
      null,
    );

    expect(result).toEqual({
      tipoIdentificacion: '07',
      identificacion: '9999999999999',
      razonSocial: 'CONSUMIDOR FINAL',
      direccion: null,
      telefono: null,
      email: null,
      verified: true,
    });
  });

  it('falls back to the LLM guess with verified: false when persona is null (RUC length)', () => {
    const result = mergeComprador(
      { ...extracted, identificacion: '1850137918001' },
      null,
    );

    expect(result.tipoIdentificacion).toBe('04');
    expect(result.verified).toBe(false);
  });

  it('derives a null tipoIdentificacion when persona is null and the length is unrecognized', () => {
    const result = mergeComprador(
      { ...extracted, identificacion: '123' },
      null,
    );

    expect(result.tipoIdentificacion).toBeNull();
  });
});
