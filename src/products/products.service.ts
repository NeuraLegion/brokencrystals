import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  Injectable,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { Product } from '../model/product.entity';

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: EntityRepository<Product>,
    private readonly em: EntityManager
  ) {}

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async findAll(
    dateFrom: Date = new Date(
      new Date().setFullYear(new Date().getFullYear() - 1)
    ),
    dateTo: Date = new Date()
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
        createdAt: { $gte: dateFrom, $lte: dateTo }
      },
      { orderBy: { createdAt: 'desc' } }
    );
  }

  async findLatest(limit: number): Promise<Product[]> {
    this.logger.debug(`Find ${limit} latest products`);
    const maxLimit = 10; // Set a maximum limit to prevent abuse
    return this.productsRepository.find(
      {},
      { limit: Math.min(limit, maxLimit), orderBy: { createdAt: 'desc' } }
    );
  }

  async searchByName(name: string): Promise<Product[]> {
    this.logger.debug(`Search products by name containing "${name}"`);
    try {
      const query = `
        select *
        from product
        where name ilike '%${name}%';
      `;
      const rows = await this.em.getConnection().execute<Product[]>(query);

      return rows.map((row: Product) => this.em.map(Product, row));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to search products by name "${name}": ${message}`,
        err instanceof Error ? err.stack : undefined
      );
      throw err;
    }
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