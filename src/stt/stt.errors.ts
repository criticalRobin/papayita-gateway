/** Network blip / AssemblyAI 5xx / rate limit / polling timeout — safe to retry. */
export class RetryableSttError extends Error {}

/** Bad API key, AssemblyAI-reported transcription failure (unsupported format, no speech) — retrying won't help. */
export class TerminalSttError extends Error {}
