import { cosineSimilarity, scoreAgainstCategories } from './similarity';
import { IntentCategory } from './types';

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1);
  });

  it('returns 0 for a zero-length vector instead of dividing by zero', () => {
    expect(cosineSimilarity([0, 0, 0], [1, 0, 0])).toBe(0);
  });
});

describe('scoreAgainstCategories', () => {
  const categoryEmbeddings: Record<IntentCategory, number[][]> = {
    greeting: [[1, 0, 0]],
    info_request: [[0, 1, 0]],
    billing_attempt: [[0, 0, 1]],
    credit_note_request: [],
    out_of_context: [],
  };

  it('picks the nearest-exemplar category above threshold', () => {
    const result = scoreAgainstCategories([0, 0, 1], categoryEmbeddings, 0.5);
    expect(result.category).toBe('billing_attempt');
    expect(result.method).toBe('embedding');
    expect(result.confidence).toBeCloseTo(1);
  });

  it('uses the best score across multiple seeds in a category', () => {
    const embeddings: Record<IntentCategory, number[][]> = {
      ...categoryEmbeddings,
      billing_attempt: [
        [0, 0, 0.3],
        [0, 0, 1],
      ],
    };
    const result = scoreAgainstCategories([0, 0, 1], embeddings, 0.5);
    expect(result.category).toBe('billing_attempt');
    expect(result.confidence).toBeCloseTo(1);
  });

  it('falls back to out_of_context when the best score is below threshold', () => {
    const result = scoreAgainstCategories(
      [0.1, 0.1, 0.1],
      categoryEmbeddings,
      0.9,
    );
    expect(result.category).toBe('out_of_context');
    expect(result.method).toBe('low_confidence_fallback');
  });
});
