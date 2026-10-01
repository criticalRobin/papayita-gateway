import { ExtractionParseError } from '../extraction.errors';
import { parseExtractionResponse } from './parse-extraction-response';

const validPayload = {
  comprador: {
    tipoIdentificacion: '05',
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

describe('parseExtractionResponse', () => {
  it('parses a valid JSON string', () => {
    const result = parseExtractionResponse(JSON.stringify(validPayload));
    expect(result).toEqual(validPayload);
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    const fenced = '```json\n' + JSON.stringify(validPayload) + '\n```';
    const result = parseExtractionResponse(fenced);
    expect(result).toEqual(validPayload);
  });

  it('throws ExtractionParseError on malformed JSON', () => {
    expect(() => parseExtractionResponse('{not json')).toThrow(
      ExtractionParseError,
    );
  });

  it('throws ExtractionParseError when the shape does not match the schema', () => {
    const invalid = JSON.stringify({ ...validPayload, items: [] });
    expect(() => parseExtractionResponse(invalid)).toThrow(
      ExtractionParseError,
    );
  });

  it('throws ExtractionParseError when a required field is missing', () => {
    const { comprador, ...rest } = validPayload;
    void comprador;
    expect(() => parseExtractionResponse(JSON.stringify(rest))).toThrow(
      ExtractionParseError,
    );
  });
});
