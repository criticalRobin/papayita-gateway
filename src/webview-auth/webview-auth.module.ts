import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { WebviewSessionModule } from '../webview-session/webview-session.module';
import {
  WEBVIEW_AUTH_REDIS_CLIENT,
  WebviewAuthService,
} from './webview-auth.service';

@Module({
  imports: [ConfigModule, WebviewSessionModule],
  providers: [
    {
      provide: WEBVIEW_AUTH_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        }),
    },
    WebviewAuthService,
  ],
  exports: [WebviewAuthService],
})
export class WebviewAuthModule {}
