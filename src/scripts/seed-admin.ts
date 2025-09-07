
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';

async function seedAdmin() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);

  try {
    await authService.signUp({
      email: 'mansurimonis8@gmail.com',
      password: 'monis123',
      name: 'System Admin',
      role: 'admin',
    });
    console.log('Admin user created successfully');
  } catch (error) {
    console.log('Admin user might already exist');
  }

  await app.close();
}

seedAdmin();