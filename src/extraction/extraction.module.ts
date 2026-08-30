import { Module } from '@nestjs/common';
import { LlmService } from './llm.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

export const EXTRACTION_CLIENT = 'EXTRACTION_CLIENT';
const LLM_CLIENT = 'LLM_CLIENT';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: LLM_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new GoogleGenAI({
          apiKey: config.getOrThrow<string>('GEMINI_API_KEY'),
        }),
    },
    {
      provide: EXTRACTION_CLIENT,
      inject: [LLM_CLIENT, ConfigService],
      useFactory: (client: GoogleGenAI, config: ConfigService) =>
        new LlmService(client, config.getOrThrow<string>('LLM_MODEL')),
    },
  ],
  exports: [EXTRACTION_CLIENT],
})
export class ExtractionModule {}
