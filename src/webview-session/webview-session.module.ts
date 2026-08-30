import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import {
  WEBVIEW_SESSION_REDIS_CLIENT,
  WebviewSessionService,
} from './webview-session.service';
import { WebviewSessionGuard } from './webview-session.guard';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: WEBVIEW_SESSION_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        }),
    },
    WebviewSessionService,
    WebviewSessionGuard,
  ],
  exports: [WebviewSessionService, WebviewSessionGuard],
})
export class WebviewSessionModule {}
