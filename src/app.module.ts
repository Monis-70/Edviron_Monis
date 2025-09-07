import { CacheModule } from '@nestjs/cache-manager';// <-- add CacheModule
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig from './config/database.config';
import { HealthController } from './health/health.controller';
// import { Cache } from 'cache-manager'; // <-- this import is not needed here

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [databaseConfig],
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('database.uri');
        const options = configService.get<Record<string, any>>('database.options') || {};
        return {
          uri,
          ...options,
        };
      },
    }),
    CacheModule.register({ // <-- add this
      ttl: 300, // cache time-to-live in seconds
      max: 100, // maximum number of items in cache
      isGlobal: true, // optional: makes cache available globally
    }),
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}