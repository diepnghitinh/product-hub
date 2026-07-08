import 'reflect-metadata';
import { Logger, ValidationPipe, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);

  app.use(helmet());
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true }),
  );

  const allowedOrigins = (config.get<string>('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowedOrigins.length
      ? allowedOrigins
      : ['http://localhost:3001', 'http://127.0.0.1:3001'],
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
