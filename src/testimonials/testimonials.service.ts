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
      `SELECT * FROM testimonial WHERE id IS NOT NULL ORDER BY created_at`
    );

    if (legacyTestimonials?.length >= this.MAX_LIMIT) {
      const ids = legacyTestimonials
        .splice(-1 * (this.MAX_LIMIT - 1))
        .map((x: Testimonial) => x.id);

      // Using parameterized query to prevent SQL Injection
      await connection.execute('DELETE FROM testimonial WHERE id NOT IN (?)', [
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

  async count(safeQuery: { sql: string, parameters: any[] }): Promise<number> {
    try {
      this.logger.debug(`Executing count query`);
      // Using parameterized query structure
      return (
        (await this.em.getConnection().execute(safeQuery.sql, safeQuery.parameters))[0].count as number
      );
    } catch (err) {
      this.logger.warn(`Failed to execute query. Error: ${err.message}`);
      throw err;
    }
  }
}
