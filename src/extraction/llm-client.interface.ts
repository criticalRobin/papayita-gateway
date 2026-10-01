import { ExtractedBillingAttempt } from './domain/types';

export interface LlmClient {
  extract(prompt: string): Promise<ExtractedBillingAttempt>;

  // Billing correction window: patches `previous` with whatever the
  // follow-up messages correct. `problemas` are plain-language descriptions
  // of what code found wrong; `messages` = original message + follow-ups.
  refine(
    previous: ExtractedBillingAttempt,
    problemas: string[],
    messages: string[],
  ): Promise<ExtractedBillingAttempt>;
}
