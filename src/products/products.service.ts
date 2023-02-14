import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Product } from '../model/product.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: EntityRepository<Product>,
    private readonly em: EntityManager,
  ) {}

  async findAll(): Promise<Product[]> {
    this.logger.debug(`Find all products`);
    return this.productsRepository.findAll({ orderBy: { created_at: 'desc' } });
  }

  async findLatest(limit: number): Promise<Product[]> {
    this.logger.debug(`Find ${limit} latest products`);
    return this.productsRepository.find(
      {},
      { limit, orderBy: { created_at: 'desc' } },
    );
  }

  async updateProduct(query: string): Promise<void> {
    try {
      this.logger.debug(`Updating products table with query "${query}"`);
      await this.em.getConnection().execute(query);
      return;
    } catch (err) {
      this.logger.warn(`Failed to execute query. Error: ${err.message}`);
      throw new InternalServerErrorException(err.message);
    }
  }
}
