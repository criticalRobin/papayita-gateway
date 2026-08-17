import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: true — needed to verify the WhatsApp webhook's X-Hub-Signature-256 against the exact bytes Meta sent.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

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
