import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { Testimonial } from '../model/testimonial.entity';

@Injectable()
export class TestimonialsService {
  private readonly MAX_LIMIT = 5;
  private readonly logger = new Logger(TestimonialsService.name);

  constructor(
    @InjectRepository(Testimonial)
    private readonly testimonialsRepository: EntityRepository<Testimonial>,
    private readonly em: EntityManager
  ) {}

  async findAll(): Promise<Testimonial[]> {
    this.logger.debug(`Find all testimonials`);
    return this.testimonialsRepository.findAll();
  }

  async createTestimonial(
    message: string,
    name: string,
    title: string
  ): Promise<Testimonial> {
    this.logger.debug(
      `Create a testimonial. Name: ${message}, title: ${title}, message: ${message}`
    );

    const connection = this.em.getConnection();
    const legacyTestimonials: Testimonial[] = await connection.execute(
      `select * from testimonial where id is not null order by created_at`
    );

    if (legacyTestimonials?.length >= this.MAX_LIMIT) {
      const ids = legacyTestimonials
        .splice(-1 * (this.MAX_LIMIT - 1))
        .map((x: Testimonial) => x.id);

      await connection.execute('delete from testimonial where id not in(?)', [
        ids
      ]);
    }

    const t = new Testimonial();
    t.message = message;
    t.name = name;
    t.title = title;

    await this.em.persistAndFlush(t);
    this.logger.debug(`Saved new testimonial`);

    return t;
  }

  async count(query: string): Promise<number> {
    try {
      this.logger.debug(`Count testimonials using allowlisted input`);

      const allowedQueries = new Map<string, string>([
        ['testimonial', 'select count(*) as count from testimonial'],
        ['all', 'select count(*) as count from testimonial']
      ]);

      const normalizedQuery = (query ?? '').trim().toLowerCase();
      const sql = allowedQueries.get(normalizedQuery);

      if (!sql) {
        throw new Error('Invalid count query');
      }

      const result = await this.em.getConnection().execute(sql);
      const countValue = result?.[0]?.count;

      return typeof countValue === 'number' ? countValue : Number(countValue) || 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      this.logger.warn(`Failed to count testimonials. Error: ${message}`);
      throw new Error('Failed to count testimonials');
    }
  }
}
