import { Logger } from '@nestjs/common';
import { GoogleGenAI } from '@google/genai';
import { LlmService } from './llm.service';
import { extractionPromptTemplate, refinementPromptTemplate } from './prompt';
import { ExtractionParseError } from './extraction.errors';

const validPayload = {
  comprador: {
    tipoIdentificacion: null,
    identificacion: '1850137918',
  },
  items: [
    {
      idCliente: 'item-1',
      textoConsulta: 'coca cola',
      cantidad: 2,
    },
  ],
};

describe('LlmService', () => {
  const model = 'gemini-2.5-flash';
  let createMock: jest.Mock;
  let client: GoogleGenAI;
  let service: LlmService;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    createMock = jest.fn();
    client = {
      interactions: { create: createMock },
    } as unknown as GoogleGenAI;
    service = new LlmService(client, model);

    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extract', () => {
    it('sends the built prompt and model to the client', async () => {
      createMock.mockResolvedValue({
        output_text: JSON.stringify(validPayload),
      });

      await service.extract('2 cocas a 1.50');

      expect(createMock).toHaveBeenCalledTimes(1);
      expect(createMock).toHaveBeenCalledWith({
        model,
        input: extractionPromptTemplate('2 cocas a 1.50'),
        generation_config: {
          thinking_level: 'minimal',
          max_output_tokens: 1024,
        },
        response_format: { type: 'text', mime_type: 'application/json' },
      });
    });

    it('disables thinking to minimize latency for this fixed-shape extraction task', async () => {
      createMock.mockResolvedValue({
        output_text: JSON.stringify(validPayload),
      });

      await service.extract('2 cocas a 1.50');

      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          generation_config: expect.objectContaining({
            thinking_level: 'minimal',
          }) as unknown,
        }),
      );
    });

    it('returns the parsed, typed extraction from the LLM response', async () => {
      createMock.mockResolvedValue({
        output_text: JSON.stringify(validPayload),
      });

      const result = await service.extract('2 cocas a 1.50');

      expect(result).toEqual(validPayload);
    });

    it('throws a generic error and logs when the client call rejects', async () => {
      createMock.mockRejectedValue(new Error('network blip'));

      await expect(service.extract('texto')).rejects.toThrow(
        'Error al extraer información',
      );
      expect(errorSpy).toHaveBeenCalled();
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

    it('throws ExtractionParseError and logs without the raw text when output is malformed', async () => {
      createMock.mockResolvedValue({ output_text: '{not json' });

      await expect(service.extract('texto')).rejects.toThrow(
        ExtractionParseError,
      );
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to parse LLM output'),
      );
    });
  });

  describe('refine', () => {
    const problemas = ['El producto "coca" no está en el catálogo.'];
    const messages = ['2 cocas', 'era coca cola'];

    it('sends the refinement prompt with the same generation config as extract', async () => {
      createMock.mockResolvedValue({
        output_text: JSON.stringify(validPayload),
      });

      const result = await service.refine(validPayload, problemas, messages);

      expect(result).toEqual(validPayload);
      expect(createMock).toHaveBeenCalledWith({
        model,
        input: refinementPromptTemplate(validPayload, problemas, messages),
        generation_config: {
          thinking_level: 'minimal',
          max_output_tokens: 1024,
        },
        response_format: { type: 'text', mime_type: 'application/json' },
      });
    });

    it('labels the original message and each correction in the prompt', () => {
      const prompt = refinementPromptTemplate(
        validPayload,
        problemas,
        messages,
      );

      expect(prompt).toContain('Mensaje original: 2 cocas');
      expect(prompt).toContain('Corrección 1: era coca cola');
      expect(prompt).toContain(problemas[0]);
    });

    it('throws ExtractionParseError on malformed output', async () => {
      createMock.mockResolvedValue({ output_text: '{not json' });

      await expect(
        service.refine(validPayload, problemas, messages),
      ).rejects.toThrow(ExtractionParseError);
    });
  });
});
