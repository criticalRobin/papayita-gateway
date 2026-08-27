import { Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { LlmService } from './llm.service';
import { extractionPromptTemplate } from './prompt';

describe('LlmService', () => {
  const model = 'gemini-2.5-flash';
  let createMock: jest.Mock;
  let client: GoogleGenAI;
  let service: LlmService;

  beforeEach(() => {
    createMock = jest.fn();
    client = {
      interactions: { create: createMock },
    } as unknown as GoogleGenAI;
    service = new LlmService(client, model);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extract', () => {
    it('sends the built prompt and model to the client', async () => {
      createMock.mockResolvedValue({ output_text: '{"products":[]}' });

      await service.extract('2 panes a 0.50');

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledWith({
        model,
        input: extractionPromptTemplate('2 panes a 0.50'),
      });
    });

    it('returns the output_text from the LLM response', async () => {
      const raw =
        '{"products":[{"producto":"pan","precioUnitario":"0.5","cantidad":"2"}]}';
      createMock.mockResolvedValue({ output_text: raw });

      const result = await service.extract('2 panes a 0.50');

      expect(result).toBe(raw);
    });

    it('throws a generic error and logs when the client call rejects', async () => {
      createMock.mockRejectedValue(new Error('network blip'));

      await expect(service.extract('texto')).rejects.toThrow(
        'Error al extraer información',
      );
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('throws when the response has no output_text', async () => {
      createMock.mockResolvedValue({ output_text: undefined });

      await expect(service.extract('texto')).rejects.toThrow(
        'No response from LLM',
      );
    });

    it('throws when the response has an empty string output_text', async () => {
      createMock.mockResolvedValue({ output_text: '' });

      await expect(service.extract('texto')).rejects.toThrow(
        'No response from LLM',
      );
    });
  });
});
