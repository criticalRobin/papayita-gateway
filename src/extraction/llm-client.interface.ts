export interface LlmClient {
  extract(prompt: string): Promise<string>;
}
