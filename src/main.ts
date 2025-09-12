import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import compression from 'compression';
import * as helmetImport from 'helmet';
import rateLimit from 'express-rate-limit';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Security
  const helmetMiddleware: any = (helmetImport as any).default ?? helmetImport;
  app.use(helmetMiddleware());

  // Compression
  app.use(compression());

  // Rate limiting (express-rate-limit middleware)
  app.use(
    rateLimit({
      windowMs: 30 * 60 * 1000, // 30 minutes
      max: 1000, // limit each IP to 1000 requests per window
      message: 'Too many requests from this IP, please try again later.',
    }),
  );

  // ✅ CORS config (dev = allow all, prod = restrict)
  const allowedOrigins = [
    'https://student-frontend-aiex.vercel.app',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://localhost:4173',
  ];
  const isDev = process.env.NODE_ENV !== 'production';

app.enableCors({
  origin: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://student-frontend-aiex.vercel.app',
    'https://edviron-api.skill-jackpot.com',  // add backend itself for SSR or same-origin
  ],
  credentials: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
  ],
});


  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Swagger (only in non-production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('School Payments API')
      .setDescription('API documentation for School Payment System')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api-docs', app, document);
  }

  app.enableShutdownHooks();

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`API Documentation: http://localhost:${port}/api-docs`);
  console.log('Allowed CORS origins:', allowedOrigins);
}

bootstrap();
