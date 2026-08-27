import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true — needed to verify the WhatsApp webhook's X-Hub-Signature-256 against the exact bytes Meta sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // Webview-facing endpoints (auth/login-webview, draft-builder, registration)
  // are called via browser fetch from the webview origin, not
  // server-to-server — without this, the browser blocks the response at the
  // CORS preflight and the request never completes (fetch throws before any
  // payload is sent, so nothing shows up in the HTTP logger below either).
  // Reuses WEBVIEW_BASE_URL, the same origin already used to build CTA links.
  const configService = app.get(ConfigService);
  app.enableCors({
    origin: configService.get<string>('WEBVIEW_BASE_URL'),
  });

  // Nest doesn't log per-request activity by default, and HttpExceptions (4xx) are never
  // auto-logged — without this, a failed webhook verify/signature check is completely silent.
  const httpLogger = new Logger('HTTP');
  app.use((req, res, next) => {
    res.on('finish', () => {
      httpLogger.log(`${req.method} ${req.originalUrl} ${res.statusCode}`);
    });
    next();
  });

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
