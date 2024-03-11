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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async findAll(
    dateFrom: Date = new Date(
      new Date().setFullYear(new Date().getFullYear() - 1),
    ),
    dateTo: Date = new Date(),
  ): Promise<Product[]> {
    this.logger.debug(`Find all products from ${dateFrom} to ${dateTo}`);
    const diffInMilliseconds = Math.abs(dateTo.getTime() - dateFrom.getTime());
    const diffInYears = diffInMilliseconds / (1000 * 60 * 60 * 24 * 365);
    if (diffInYears >= 2) {
      await this.sleep(2000);
      //This is to simulate a long query
    }
    return this.productsRepository.find(
      {
        created_at: { $gte: dateFrom, $lte: dateTo },
      },
      { orderBy: { created_at: 'desc' } },
    );
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
