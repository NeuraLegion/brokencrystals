import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OrmModule } from '../orm/orm.module';
import { UsersModule } from '../users/users.module';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsResolver } from './testimonials.resolver';
import { TestimonialsService } from './testimonials.service';

@Module({
  imports: [OrmModule, AuthModule, UsersModule],
  controllers: [TestimonialsController],
  providers: [TestimonialsService, TestimonialsResolver],
  exports: [TestimonialsService],
})
export class TestimonialsModule {}
