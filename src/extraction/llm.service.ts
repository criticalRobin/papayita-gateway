import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from './llm-client.interface';
import { GoogleGenAI } from '@google/genai';
import { extractionPromptTemplate } from './prompt';
import { parseExtractionResponse } from './domain/parse-extraction-response';
import { ExtractedBillingAttempt } from './domain/types';
import { ExtractionParseError } from './extraction.errors';

@Injectable()
export class LlmService implements LlmClient {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string,
  ) {}

  async extract(text: string): Promise<ExtractedBillingAttempt> {
    const prompt: string = this.buildPrompt(text);
    const interaction = await this.client.interactions
      .create({
        model: this.model,
        input: prompt,
        // This is a fixed structured-extraction task, not open-ended
        // reasoning — the model's default "thinking" budget can add several
        // seconds of hidden tokens before it even starts the visible output,
        // which was the actual latency bottleneck (not prompt length).
        // 'minimal' disables that for negligible accuracy cost on this task.
        generation_config: {
          thinking_level: 'minimal',
          max_output_tokens: 1024,
        },
        // Skips markdown-fence wrapping outright — parseExtractionResponse
        // still strips fences defensively, but this avoids generating them.
        response_format: { type: 'text', mime_type: 'application/json' },
      })
      .catch((error: unknown) => {
        this.logger.error('Error al extraer información:', error);
        throw new Error('Error al extraer información');
      });

    if (!interaction.output_text) {
      this.logger.error('No response from LLM');
      throw new Error('No response from LLM');
    }

    try {
      const result = parseExtractionResponse(interaction.output_text);
      this.logger.log('Información extraída exitosamente');
      return result;
    } catch (error) {
      if (error instanceof ExtractionParseError) {
        this.logger.error(
          `Failed to parse LLM output (length=${interaction.output_text.length}): ${error.message}`,
        );
      }
      throw error;
    }
  }

  private buildPrompt(text: string): string {
    return extractionPromptTemplate(text);
  }
}
