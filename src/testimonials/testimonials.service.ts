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
      const queryTemplate = 'SELECT COUNT(*) AS count FROM testimonial WHERE <CONDITION>'; // Example template
      const conditionMap = { // Allowlist conditions and corresponding SQL templates
        'all': '1=1',
        'active': 'active IS TRUE'
        // Add more mappings as necessary
      };

      const condition = conditionMap[query];
      if (!condition) {
        throw new Error('Invalid query parameter.');
      }

      const sqlQuery = queryTemplate.replace('<CONDITION>', condition);

      const result = await this.em.getConnection().execute(sqlQuery);
      return result[0].count as number;
    } catch (err) {
      this.logger.warn(`Failed to execute query. Error: ${err.message}`);
      return 0;
    }
  }
}
