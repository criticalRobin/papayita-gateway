/** LLM output wasn't valid JSON, or didn't match the expected shape — terminal, not worth retrying with the same input. */
export class ExtractionParseError extends Error {}
