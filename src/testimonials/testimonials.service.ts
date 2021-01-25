import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { Testimonial } from '../model/testimonial.entity';

@Injectable()
export class TestimonialsService {
  private log: Logger = new Logger(TestimonialsService.name);

  constructor(
    @InjectRepository(Testimonial)
    private readonly testimonialsRepository: EntityRepository<Testimonial>,
    private readonly em: EntityManager,
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

  async count(query: string): Promise<string> {
    try {
      console.log(query);
      return (await this.em.getConnection().execute(query))[0].count as string;
    } catch (err) {
      this.log.warn(`Failed to execute query. Error - ${err.message}`);
      return err.message;
    }
  }
}
