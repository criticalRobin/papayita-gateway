import { ClassificationResult, IntentCategory } from './types';

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Nearest-exemplar scoring: the max similarity against any single seed
// embedding in a category, not a centroid/mean. Robust to phrasing spread
// across a handful of examples per category, and trivially extensible —
// adding one seed phrase later doesn't require recomputing anything else.
export function scoreAgainstCategories(
  messageEmbedding: number[],
  categoryEmbeddings: Record<IntentCategory, number[][]>,
  threshold: number,
): ClassificationResult {
  let bestCategory: IntentCategory | null = null;
  let bestScore = -Infinity;

  for (const category of Object.keys(categoryEmbeddings) as IntentCategory[]) {
    const embeddings = categoryEmbeddings[category];
    for (const embedding of embeddings) {
      const score = cosineSimilarity(messageEmbedding, embedding);
      if (score > bestScore) {
        bestScore = score;
        bestCategory = category;
      }
    }
  }

  if (!bestCategory || bestScore < threshold) {
    return {
      category: 'out_of_context',
      confidence: bestCategory ? bestScore : 0,
      method: 'low_confidence_fallback',
    };
  }

  return { category: bestCategory, confidence: bestScore, method: 'embedding' };
}
