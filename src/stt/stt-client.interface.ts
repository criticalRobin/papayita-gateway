export interface SttClient {
  /** Returns the transcript text, trimmed. Empty string if no speech was detected — callers decide the fallback UX. */
  transcribe(audio: Buffer): Promise<string>;
}
