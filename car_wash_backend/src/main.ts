import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'geolocation=(self)');
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; frame-ancestors 'none'; base-uri 'self'",
      );
    }
    next();
  });
  app.useStaticAssets(path.join(process.cwd(), 'uploads'), {
    prefix: '/uploads',
  });

  const nodeEnv = configService.get<string>('app.nodeEnv') ?? 'development';
  const corsOriginsRaw = configService.get<string>('app.corsOrigins') ?? '*';
  if (nodeEnv === 'production' && corsOriginsRaw.trim() === '*') {
    throw new Error(
      'CORS_ORIGINS cannot be "*" in production. Set explicit allowed origins.',
    );
  }

  const piiActiveKeyId =
    configService.get<string>('security.piiActiveKeyId') ||
    process.env.PII_ENCRYPTION_ACTIVE_KEY_ID ||
    '';
  const piiKeysRaw =
    configService.get<string>('security.piiKeys') ||
    process.env.PII_ENCRYPTION_KEYS ||
    '';
  if (nodeEnv === 'production' && (!piiActiveKeyId || !piiKeysRaw)) {
    throw new Error(
      'PII encryption is required in production. Set PII_ENCRYPTION_ACTIVE_KEY_ID and PII_ENCRYPTION_KEYS.',
    );
  }

  const allowAnyOrigin =
    corsOriginsRaw.trim() === '*' && nodeEnv !== 'production';
  const corsOrigins = allowAnyOrigin
    ? true
    : corsOriginsRaw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  if (configService.get<boolean>('app.trustProxy')) {
    app.set('trust proxy', 1);
  }

  const uploadDirs = [
    'uploads/cars',
    'uploads/licenses',
    'uploads/mugshots',
    'uploads/ids',
  ];

  uploadDirs.forEach((dir) => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`Created upload directory: ${fullPath}`);
    }
  });

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
