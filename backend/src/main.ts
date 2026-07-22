import 'reflect-metadata';
// Load the per-environment config from /config before anything reads env.
import '@shared/utils/dotenv';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  // `bodyParser: false` skips Express's default JSON parser (a 100kb limit that
  // would 413 before ours ran); we re-register it below with a larger cap.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  // Rich-text descriptions can inline an image as a base64 data URL when no
  // cloud storage is configured, so a single request may carry a few hundred KB.
  // Raise the JSON/form body limit accordingly (overridable via env for prod).
  const bodyLimit = config.get<string>('MAX_REQUEST_BODY_SIZE', '10mb');
  app.useBodyParser('json', { limit: bodyLimit });
  app.useBodyParser('urlencoded', { limit: bodyLimit, extended: true });

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );

  const allowedOrigins = (config.get<string>('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // `*` can't be sent as a literal header value alongside `credentials: true`,
  // and inside an array it's matched literally so it never hits a real origin.
  // `origin: true` reflects the caller's Origin back instead — same "allow
  // everyone" effect, but spec-compliant with credentials.
  const corsOrigin = allowedOrigins.includes('*')
    ? true
    : allowedOrigins.length
      ? allowedOrigins
      : ['http://localhost:3001', 'http://127.0.0.1:3001'];
  app.enableCors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept-Language',
      'X-Api-Key',
    ],
  });

  // URI versioning → every route is served under /v1 by default.
  // prefix:'' means the version literal ('v1') is used verbatim (no extra 'v'),
  // giving /v1/... rather than the default /vv1/...
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: 'v1',
    prefix: '',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('product-hub API')
    .setDescription(
      'Product-management hub — projects, reports, test cases, bugs, roadmaps, milestones',
    )
    .setVersion('1.0')
    .addBearerAuth(
      { in: 'header', type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'JWT-auth',
    )
    .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'x-api-key')
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('swagger', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);
  Logger.log(
    `product-hub API running on http://localhost:${port}/v1  (Swagger: /swagger)`,
    'Bootstrap',
  );
}
bootstrap();
