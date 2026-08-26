import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { CoreApiModule } from '../core-api/core-api.module';
import { WebviewAuthModule } from '../webview-auth/webview-auth.module';
import { AUTH_REDIS_CLIENT, AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [ConfigModule, CoreApiModule, WebviewAuthModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.getOrThrow<string>('REDIS_HOST'),
          port: config.getOrThrow<number>('REDIS_PORT'),
        }),
    },
    AuthService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
