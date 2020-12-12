import { Module } from '@nestjs/common';
import { AuthModule } from 'src/auth/auth.module';
import { OrmModule } from 'src/orm/orm.module';
import { UsersModule } from 'src/users/users.module';
import { TestimonialsController } from './testimonials.controller';
import { TestimonialsService } from './testimonials.service';

@Module({
  imports: [OrmModule, AuthModule, UsersModule],
  controllers: [TestimonialsController],
  providers: [TestimonialsService],
  exports: [TestimonialsService],
})
export class TestimonialsModule {}
