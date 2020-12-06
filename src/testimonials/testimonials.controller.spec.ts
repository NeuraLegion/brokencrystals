import { Test, TestingModule } from '@nestjs/testing';
import { TestimonialsController } from './testimonials.controller';

describe('TestimonialsController', () => {
  let controller: TestimonialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestimonialsController],
    }).compile();

    controller = module.get<TestimonialsController>(TestimonialsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
