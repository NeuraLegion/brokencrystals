import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Crystal } from '../model/crystal.entity';

@Injectable()
export class CrystalsService {
  private readonly MAX_LIMIT = 5;
  private readonly logger = new Logger(CrystalsService.name);

  constructor(
    @InjectRepository(Crystal)
    private readonly crystalsRepository: EntityRepository<Crystal>,
    private readonly em: EntityManager,
  ) {}

  async findAll(): Promise<Crystal[]> {
    this.logger.debug(`Find all crystals`);
    return this.crystalsRepository.findAll();
  }

  async createCrystal(
    name: string,
    category: string,
    photoUrl: string,
    description: string,
  ): Promise<Crystal> {
    this.logger.debug(
      `Create a crystal. Name: ${name}, category: ${category}, escription: ${description}, photoUrl: ${photoUrl}`,
    );

    const connection = this.em.getConnection();
    const legacyCrystals: Crystal[] = await connection.execute(
      `select * from crystal where id is not null order by created_at`,
    );

    if (legacyCrystals?.length >= this.MAX_LIMIT) {
      const ids = legacyCrystals
        .splice(-1 * (this.MAX_LIMIT - 1))
        .map((x: Crystal) => x.id);

      await connection.execute('delete from crystal where id not in(?)', [
        ids,
      ]);
    }

    const c = new Crystal();
    c.name = name;
    c.category = category;
    c.photoUrl = photoUrl;
    c.description = description;

    await this.crystalsRepository.persistAndFlush(c);
    this.logger.debug(`Saved new crystal`);

    return c;
  }

  async count(query: string): Promise<string> {
    try {
      this.logger.debug(`Saved new crystal`);

      return (await this.em.getConnection().execute(query))[0].count as string;
    } catch (err) {
      this.logger.warn(`Failed to execute query. Error: ${err.message}`);
      return err.message;
    }
  }
}
