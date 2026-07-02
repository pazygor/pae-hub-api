import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const port = process.env.PORT || 3001;
  const prefix = process.env.API_PREFIX || 'api';
  const corsOrigins = (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:3000,http://localhost:5173').split(',');

  // ─── Global prefix ────────────────────────────────────────────────────────
  app.setGlobalPrefix(prefix);

  // ─── CORS ─────────────────────────────────────────────────────────────────
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  // ─── Validation ───────────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // ─── Swagger ──────────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('M1 PAE Hub API')
      .setDescription('Back-end de Domínio — NestJS + Prisma + PostgreSQL')
      .setVersion('1.0.0')
      .addBearerAuth()
      .addTag('Auth', 'Autenticação e autorização')
      .addTag('Users', 'Gestão de usuários')
      .addTag('Occurrences', 'Gestão de ocorrências e emergências')
      .addTag('Alerts', 'Alertas operacionais')
      .addTag('War Room', 'Salas de crise')
      .addTag('Safety', 'Segurança do trabalho')
      .addTag('Dashboard', 'KPIs e indicadores')
      .addTag('AI Command', 'Inteligência artificial e insights')
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });

    console.log(`📚 Swagger disponível em: http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  console.log(`🚀 M1 PAE API rodando em: http://localhost:${port}/${prefix}`);
  console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
}

bootstrap();
