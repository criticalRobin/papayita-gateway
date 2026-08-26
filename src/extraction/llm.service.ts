import { Injectable, Logger } from '@nestjs/common';
import { LlmClient } from './llm-client.interface';
import { GoogleGenAI } from '@google/genai';
import { extractionPromptTemplate } from './prompt';

@Injectable()
export class LlmService implements LlmClient {
  private readonly logger = new Logger(LlmService.name);

  constructor(
    private readonly client: GoogleGenAI,
    private readonly model: string,
  ) {}

  async extract(text: string): Promise<string> {
    const prompt: string = this.buildPrompt(text);
    const interaction = await this.client.interactions
      .create({
        model: this.model,
        input: prompt,
      })
      .catch((error: unknown) => {
        this.logger.error('Error al extraer información:', error);
        throw new Error('Error al extraer información');
      });

    if (!interaction.output_text) {
      this.logger.error('No response from LLM');
      throw new Error('No response from LLM');
    }

    this.logger.log('Información extraída exitosamente');
    return interaction.output_text;
  }

  private buildPrompt(text: string): string {
    return extractionPromptTemplate(text);
  }
}
