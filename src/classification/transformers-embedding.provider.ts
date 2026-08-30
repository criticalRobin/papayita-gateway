import { Injectable } from '@nestjs/common';
import type { FeatureExtractionPipeline } from '@xenova/transformers';
import { EmbeddingProvider } from './embedding-provider.interface';

const MODEL_NAME = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

@Injectable()
export class TransformersEmbeddingProvider implements EmbeddingProvider {
  private pipelinePromise: Promise<FeatureExtractionPipeline> | null = null;

  async embed(text: string): Promise<number[]> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    return Array.from(output.data as Float32Array);
  }

  private getPipeline(): Promise<FeatureExtractionPipeline> {
    if (!this.pipelinePromise) {
      this.pipelinePromise = this.loadPipeline();
    }
    return this.pipelinePromise;
  }

  // Dynamic import (not a static top-of-file import): @xenova/transformers is
  // WASM/ONNX-backed and this keeps module resolution safe under Nest's CJS
  // build target regardless of how the package ships its own module format.
  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    const { pipeline, env } = await import('@xenova/transformers');
    env.allowRemoteModels = process.env.NODE_ENV !== 'production';
    env.cacheDir =
      process.env.TRANSFORMERS_CACHE_DIR ?? './.cache/transformers';
    return pipeline('feature-extraction', MODEL_NAME);
  }
}
