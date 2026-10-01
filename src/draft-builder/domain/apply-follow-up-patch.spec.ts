import { applyFollowUpPatch } from './apply-follow-up-patch';
import type { BillingIssue } from './errors';

const extracted = {
  comprador: { tipoIdentificacion: '05', identificacion: '1111111111' },
  items: [{ idCliente: 'item-1', textoConsulta: 'chompa', cantidad: 2 }],
};
const idIssue: BillingIssue = {
  kind: 'identificacion_no_encontrada',
  identificacion: '1111111111',
  detalle: 'no existe',
};
const productIssue: BillingIssue = {
  kind: 'producto_no_encontrado',
  termino: 'chompa',
};

describe('applyFollowUpPatch', () => {
  it('patches a bare 10-digit cédula, keeping items and resetting tipo for re-derivation', () => {
    expect(applyFollowUpPatch(extracted, [idIssue], '1850137918')).toEqual({
      comprador: { tipoIdentificacion: null, identificacion: '1850137918' },
      items: extracted.items,
    });
  });

  it('patches a 13-digit RUC wrapped in short text', () => {
    const result = applyFollowUpPatch(
      extracted,
      [idIssue],
      'perdón, es el RUC 1850137918001.',
    );
    expect(result?.comprador.identificacion).toBe('1850137918001');
  });

  it('returns null when a product issue is also open (needs the LLM path)', () => {
    expect(
      applyFollowUpPatch(extracted, [idIssue, productIssue], '1850137918'),
    ).toBeNull();
  });

  it('returns null when the follow-up has no id number', () => {
    expect(
      applyFollowUpPatch(extracted, [idIssue], 'ya lo corregí'),
    ).toBeNull();
  });

  it('returns null when the follow-up has more than one id number (ambiguous)', () => {
    expect(
      applyFollowUpPatch(extracted, [idIssue], '1850137918 o 1712345678'),
    ).toBeNull();
  });

  it('returns null with no open issues', () => {
    expect(applyFollowUpPatch(extracted, [], '1850137918')).toBeNull();
  });
});
