import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AssemblyAI } from 'assemblyai';
import { AssemblyAiService } from './assemblyai.service';

export const STT_CLIENT = 'STT_CLIENT';
const ASSEMBLYAI_SDK_CLIENT = 'ASSEMBLYAI_SDK_CLIENT';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: ASSEMBLYAI_SDK_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new AssemblyAI({
          apiKey: config.getOrThrow<string>('ASSEMBLYAI_API_KEY'),
        }),
    },
    {
      provide: STT_CLIENT,
      inject: [ASSEMBLYAI_SDK_CLIENT],
      useFactory: (client: AssemblyAI) => new AssemblyAiService(client),
    },
  ],
  exports: [STT_CLIENT],
})
export class SttModule {}
