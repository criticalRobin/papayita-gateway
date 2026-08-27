import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingProvider } from './embedding-provider.interface';
import { applyRules } from './domain/rules';
import { scoreAgainstCategories } from './domain/similarity';
import { SEED_PHRASES } from './domain/seed-phrases';
import { ClassificationResult, IntentCategory } from './domain/types';

export const EMBEDDING_PROVIDER = 'EMBEDDING_PROVIDER';

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private categoryEmbeddingsPromise: Promise<
    Record<IntentCategory, number[][]>
  > | null = null;

  constructor(
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly config: ConfigService,
  ) {}

  async classify(text: string): Promise<ClassificationResult> {
    const ruleMatch = applyRules(text);
    if (ruleMatch) {
      this.logger.log(`classification: rule -> ${ruleMatch}`);
      return { category: ruleMatch, confidence: 1, method: 'rule' };
    }

    try {
      const categoryEmbeddings = await this.getCategoryEmbeddings();
      const messageEmbedding = await this.embeddingProvider.embed(text);
      const threshold = this.config.get<number>(
        'CLASSIFICATION_CONFIDENCE_THRESHOLD',
        0.45,
      );
      const result = scoreAgainstCategories(
        messageEmbedding,
        categoryEmbeddings,
        threshold,
      );
      this.logger.log(
        `classification: embedding -> ${result.category} (confidence=${result.confidence.toFixed(2)})`,
      );
      return result;
    } catch (error) {
      // Model failed to load/embed — degrade instead of failing the whole
      // message pipeline (concurrency: 1, one bad load shouldn't stall it).
      this.logger.error(
        `classification embedding step failed, falling back: ${(error as Error).message}`,
      );
      return {
        category: 'out_of_context',
        confidence: 0,
        method: 'low_confidence_fallback',
      };
    }
  }

  private getCategoryEmbeddings(): Promise<Record<IntentCategory, number[][]>> {
    if (!this.categoryEmbeddingsPromise) {
      this.categoryEmbeddingsPromise = this.embedSeedPhrases();
    }
    return this.categoryEmbeddingsPromise;
  }

  private async embedSeedPhrases(): Promise<
    Record<IntentCategory, number[][]>
  > {
    const categories = Object.keys(SEED_PHRASES) as IntentCategory[];
    const result = {} as Record<IntentCategory, number[][]>;
    for (const category of categories) {
      result[category] = await Promise.all(
        SEED_PHRASES[category].map((phrase) =>
          this.embeddingProvider.embed(phrase),
        ),
      );
    }
    return result;
  }
}
