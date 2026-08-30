import { DraftBuilderController } from './draft-builder.controller';
import type { DraftBuilderService } from './draft-builder.service';
import type { RequestWithWebviewSession } from '../webview-session/webview-session.guard';

function makeRequest(): RequestWithWebviewSession {
  return {
    webviewSession: { phoneNumber: '+593993908744', correlationId: 'corr-1' },
  } as unknown as RequestWithWebviewSession;
}

describe('DraftBuilderController', () => {
  it('GET returns the draft for the sessionphone+correlationId', async () => {
    const draft = { correlationId: 'corr-1', items: [] };
    const getDraft = jest.fn().mockResolvedValue(draft);
    const controller = new DraftBuilderController({
      getDraft,
    } as unknown as DraftBuilderService);

    const result = await controller.getDraft(makeRequest());

    expect(getDraft).toHaveBeenCalledWith('+593993908744', 'corr-1');
    expect(result).toBe(draft);
  });

  it('POST confirm delegates to confirmAndSubmit and returns a submitted status', async () => {
    const confirmAndSubmit = jest.fn().mockResolvedValue({ ambiente: '1' });
    const controller = new DraftBuilderController({
      confirmAndSubmit,
    } as unknown as DraftBuilderService);
    const dto = {
      comprador: {},
      detalles: [{ idCliente: 'item-1', cantidad: 1 }],
    };

    const result = await controller.confirmDraft(makeRequest(), dto);

    expect(confirmAndSubmit).toHaveBeenCalledWith(
      '+593993908744',
      'corr-1',
      dto,
    );
    expect(result).toEqual({ correlationId: 'corr-1', status: 'submitted' });
  });
});
