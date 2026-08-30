import { formatRejectionMessage } from './format-rejection-message';

describe('formatRejectionMessage', () => {
  it('prefers the first ERROR-typed message', () => {
    const message = formatRejectionMessage([
      { identificador: '1', mensaje: 'aviso menor', tipo: 'INFO' },
      {
        identificador: '35',
        mensaje: 'ARCHIVO NO CUMPLE ESTRUCTURA XML',
        tipo: 'ERROR',
      },
    ]);
    expect(message).toContain('ARCHIVO NO CUMPLE ESTRUCTURA XML');
  });

  it('falls back to the first message when none is typed ERROR', () => {
    const message = formatRejectionMessage([
      { identificador: '1', mensaje: 'aviso menor', tipo: 'INFO' },
    ]);
    expect(message).toContain('aviso menor');
  });

  it('falls back to a generic reason when the list is empty', () => {
    const message = formatRejectionMessage([]);
    expect(message).toContain('motivo desconocido');
  });
});
