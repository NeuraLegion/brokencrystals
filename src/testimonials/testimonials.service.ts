import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
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
    const normalizedQuery = query?.trim();

    if (!normalizedQuery) {
      throw new BadRequestException(
        'Query parameter is required and must be a non-empty string.'
      );
    }

    const searchTerm = `%${normalizedQuery}%`;

    try {
      this.logger.debug('Count testimonials for provided search term.');
      const [row] = await this.em.getConnection().execute<{ count: number }[]>(
        `
          SELECT COUNT(*)::int AS count
          FROM testimonial
          WHERE message ILIKE ?
             OR name ILIKE ?
             OR title ILIKE ?
        `,
        [searchTerm, searchTerm, searchTerm]
      );
      return row?.count ?? 0;
    } catch (err) {
      this.logger.error(`Failed to count testimonials. Error: ${err.message}`);
      throw new InternalServerErrorException('Failed to count testimonials.');
    }
  }
}
