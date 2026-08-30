import { ExtractedBillingAttempt } from './domain/types';

export interface LlmClient {
  extract(prompt: string): Promise<ExtractedBillingAttempt>;
}
