import { ConfigService } from '@nestjs/config';
import { ClassificationService } from './classification.service';
import { EmbeddingProvider } from './embedding-provider.interface';
import { SEED_PHRASES } from './domain/seed-phrases';

const CATEGORY_AXIS: Record<string, number[]> = {
  greeting: [1, 0, 0],
  info_request: [0, 1, 0],
  billing_attempt: [0, 0, 1],
};

function axisForPhrase(phrase: string): number[] {
  for (const [category, phrases] of Object.entries(SEED_PHRASES)) {
    if (phrases.includes(phrase)) {
      return CATEGORY_AXIS[category];
    }
  }
  return [0, 0, 0];
}

function makeConfig(threshold = 0.45): ConfigService {
  return {
    get: jest.fn().mockReturnValue(threshold),
  } as unknown as ConfigService;
}

describe('ClassificationService', () => {
  it('short-circuits on the rule fast-path without calling the embedding provider', async () => {
    const embed = jest.fn();
    const provider: EmbeddingProvider = { embed };
    const service = new ClassificationService(provider, makeConfig());

    const result = await service.classify('hola');

    expect(result).toEqual({
      category: 'greeting',
      confidence: 1,
      method: 'rule',
    });
    expect(embed).not.toHaveBeenCalled();
  });

  it('classifies via embedding similarity when no rule matches', async () => {
    // Deliberately avoids the rule fast-path's verb/id-number patterns (see
    // rules.spec.ts) so this test actually exercises embedding scoring.
    const novelPhrasing =
      'hoy vendi una torta y quiero el documento correspondiente';
    const embed = jest.fn((text: string) =>
      Promise.resolve(
        text === novelPhrasing
          ? CATEGORY_AXIS.billing_attempt
          : axisForPhrase(text),
      ),
    );
    const provider: EmbeddingProvider = { embed };
    const service = new ClassificationService(provider, makeConfig(0.5));

    const result = await service.classify(novelPhrasing);

    expect(result.category).toBe('billing_attempt');
    expect(result.method).toBe('embedding');
    expect(embed).toHaveBeenCalled();
  });

  it('falls back to out_of_context when embedding confidence is below threshold', async () => {
    const embed = jest.fn((text: string) =>
      Promise.resolve(
        text === 'mensaje ambiguo sin relacion'
          ? [0, 0, 0]
          : axisForPhrase(text),
      ),
    );
    const provider: EmbeddingProvider = { embed };
    const service = new ClassificationService(provider, makeConfig(0.9));

    const result = await service.classify('mensaje ambiguo sin relacion');

    expect(result.category).toBe('out_of_context');
    expect(result.method).toBe('low_confidence_fallback');
  });

  it('degrades to out_of_context when the embedding provider fails', async () => {
    const embed = jest.fn().mockRejectedValue(new Error('model load failed'));
    const provider: EmbeddingProvider = { embed };
    const service = new ClassificationService(provider, makeConfig());

    const result = await service.classify('mensaje cualquiera');

    expect(result).toEqual({
      category: 'out_of_context',
      confidence: 0,
      method: 'low_confidence_fallback',
    });
  });
});
