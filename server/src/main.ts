import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Day 8 security hardening — this is a pure JSON API (the frontend is a
  // separately-served SPA on its own origin, never rendered by this
  // server), so helmet's defaults are safe here: they only affect this
  // server's OWN responses, never the frontend page's ability to embed
  // YouTube/OneCompiler iframes or fetch this API cross-origin (that's
  // governed entirely by the CORS config below, unaffected by helmet).
  app.use(helmet());
  app.use(cookieParser());

  // Explicit, deliberate body-size ceiling — previously unset, which meant
  // Express/body-parser's own undocumented-here default (100kb) silently
  // applied to every route, well below what CreateSubmissionDto's own
  // declared limits (50 files x 200,000 chars each) actually allow through
  // validation. 12mb comfortably covers that DTO's real worst case (~10MB
  // of string content, plus JSON structural overhead) without being
  // unbounded — still a hard, enforced ceiling (still returns a clean 413,
  // not a memory spike/crash, for anything larger).
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Credentials + an explicit origin (never '*') — cookies-based auth
  // requires both, per NEXTSTEP2_BACKEND_ARCHITECTURE_AND_TECHNOLOGY_SELECTION.md
  // Part 11/14.
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', 'http://localhost:5173'),
    credentials: true,
  });

  const port = config.get<string>('PORT', '3000');
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`NextStep2 backend (Phase 0) listening on port ${port}`);
}

bootstrap();
