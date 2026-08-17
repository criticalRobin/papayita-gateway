import { Injectable, Logger } from '@nestjs/common';
import type { AssemblyAI } from 'assemblyai';
import { SttClient } from './stt-client.interface';
import { RetryableSttError, TerminalSttError } from './stt.errors';

@Injectable()
export class AssemblyAiService implements SttClient {
  private readonly logger = new Logger(AssemblyAiService.name);

  // The SDK client is injected (see stt.module.ts) rather than constructed here,
  // so tests can hand-build a fake without a TestingModule.
  constructor(private readonly client: AssemblyAI) {}

  async transcribe(audio: Buffer): Promise<string> {
    const transcript = await this.client.transcripts
      .transcribe({ audio })
      .catch((error: unknown) => {
        throw this.mapRequestError(error);
      });

    if (transcript.status === 'error') {
      throw new TerminalSttError(
        `AssemblyAI reported a transcription error: ${transcript.error ?? 'unknown'}`,
      );
    }
    return (transcript.text ?? '').trim();
  }

  // The assemblyai SDK exposes no dedicated REST-error class for this call — its base
  // HTTP layer throws a plain Error whose message is `HTTP Error: <status> <statusText>`
  // (or a parsed API error body). We parse the status back out of the message; re-verify
  // this format if the assemblyai dependency is ever bumped.
  private mapRequestError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.error(`AssemblyAI request failed: ${message}`);

    const statusMatch = /^HTTP Error: (\d+)/.exec(message);
    if (statusMatch) {
      const status = Number(statusMatch[1]);
      if (status >= 500 || status === 429) {
        return new RetryableSttError(
          `AssemblyAI request failed (status ${status})`,
        );
      }
      return new TerminalSttError(
        `AssemblyAI request rejected (status ${status})`,
      );
    }
    // Network error / polling timeout / unrecognized shape — default to retryable:
    // safer to retry a transient failure than to silently swallow it.
    return new RetryableSttError(`AssemblyAI request failed: ${message}`);
  }
}
