import type { AssemblyAI } from 'assemblyai';
import { AssemblyAiService } from './assemblyai.service';
import { RetryableSttError, TerminalSttError } from './stt.errors';

function makeClient(transcribe: jest.Mock): AssemblyAI {
  return { transcripts: { transcribe } } as unknown as AssemblyAI;
}

describe('AssemblyAiService', () => {
  it('returns the trimmed transcript on success', async () => {
    const transcribe = jest
      .fn()
      .mockResolvedValue({ status: 'completed', text: '  hola mundo  ' });
    const service = new AssemblyAiService(makeClient(transcribe));

    await expect(service.transcribe(Buffer.from('audio'))).resolves.toBe(
      'hola mundo',
    );
  });

  it('returns an empty string when no text is present', async () => {
    const transcribe = jest
      .fn()
      .mockResolvedValue({ status: 'completed', text: null });
    const service = new AssemblyAiService(makeClient(transcribe));

    await expect(service.transcribe(Buffer.from('audio'))).resolves.toBe('');
  });

  it('throws TerminalSttError when AssemblyAI reports a transcription error', async () => {
    const transcribe = jest
      .fn()
      .mockResolvedValue({ status: 'error', error: 'no speech detected' });
    const service = new AssemblyAiService(makeClient(transcribe));

    await expect(service.transcribe(Buffer.from('audio'))).rejects.toThrow(
      TerminalSttError,
    );
  });

  it('maps a 5xx request failure to RetryableSttError', async () => {
    const transcribe = jest
      .fn()
      .mockRejectedValue(new Error('HTTP Error: 500 Internal Server Error'));
    const service = new AssemblyAiService(makeClient(transcribe));

    await expect(service.transcribe(Buffer.from('audio'))).rejects.toThrow(
      RetryableSttError,
    );
  });

  it('maps a 429 request failure to RetryableSttError', async () => {
    const transcribe = jest
      .fn()
      .mockRejectedValue(new Error('HTTP Error: 429 Too Many Requests'));
    const service = new AssemblyAiService(makeClient(transcribe));

    await expect(service.transcribe(Buffer.from('audio'))).rejects.toThrow(
      RetryableSttError,
    );
  });

  it('maps a 401 request failure to TerminalSttError', async () => {
    const transcribe = jest
      .fn()
      .mockRejectedValue(new Error('HTTP Error: 401 Unauthorized'));
    const service = new AssemblyAiService(makeClient(transcribe));

    await expect(service.transcribe(Buffer.from('audio'))).rejects.toThrow(
      TerminalSttError,
    );
  });

  it('defaults an unrecognized error shape to RetryableSttError', async () => {
    const transcribe = jest.fn().mockRejectedValue(new Error('fetch failed'));
    const service = new AssemblyAiService(makeClient(transcribe));

    await expect(service.transcribe(Buffer.from('audio'))).rejects.toThrow(
      RetryableSttError,
    );
  });
});
