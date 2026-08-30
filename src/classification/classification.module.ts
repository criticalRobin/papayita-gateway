import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  ClassificationService,
  EMBEDDING_PROVIDER,
} from './classification.service';
import { TransformersEmbeddingProvider } from './transformers-embedding.provider';

@Module({
  imports: [ConfigModule],
  providers: [
    { provide: EMBEDDING_PROVIDER, useClass: TransformersEmbeddingProvider },
    ClassificationService,
  ],
  exports: [ClassificationService],
})
export class ClassificationModule {}
