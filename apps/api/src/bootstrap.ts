import { json } from 'express';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { config } from './config';

/** Configuración común de la app (la usan main.ts y los tests e2e). */
export function configurarApp(app: INestApplication) {
  app.setGlobalPrefix('api');
  app.use(json({ limit: '5mb' }));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  return app;
}
