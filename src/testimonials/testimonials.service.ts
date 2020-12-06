import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { Testimonial } from 'src/model/testimonial.entity';

@Injectable()
export class TestimonialsService {
  private log: Logger = new Logger(TestimonialsService.name);

  constructor(
    @InjectRepository(Testimonial)
    private readonly testimonialsRepository: EntityRepository<Testimonial>,
  ) {}

  async findAll(): Promise<Testimonial[]> {
    this.log.debug(`Called findAll`);
    return this.testimonialsRepository.findAll();
  }

  async createTestimonial(
    message: string,
    name: string,
    title: string,
  ): Promise<Testimonial> {
    this.log.debug(`Called createTestimonial`);

    const t = new Testimonial();
    t.message = message;
    t.name = name;
    t.title = title;

    await this.testimonialsRepository.persistAndFlush(t);
    this.log.debug(`Saved new testimonial`);

    return t;
  }
}
