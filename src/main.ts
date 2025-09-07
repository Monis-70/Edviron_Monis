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

    app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,   // strips unknown properties
      transform: true,   // auto-transform payloads (e.g., "5000" → 5000 for @IsNumber)
    }),
  );

  // Compression
  app.use(compression());

  // Rate limiting (express-rate-limit middleware)
  app.use(  
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
    }),
  );

  // CORS - single source of truth for frontend origin
  const frontendOrigin =  'http://localhost:5173';
  app.enableCors({
    origin: frontendOrigin,
    credentials: true,
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
}

bootstrap();