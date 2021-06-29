import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Product } from '../model/product.entity';

@Injectable()
export class ProductsService {
  private readonly MAX_LIMIT = 5;
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: EntityRepository<Product>,
    private readonly em: EntityManager,
  ) {}

  async findAll(): Promise<Product[]> {
    this.logger.debug(`Find all products`);
    return this.productsRepository.findAll();
  }

  async createProduct(
    name: string,
    category: string,
    photoUrl: string,
    description: string,
  ): Promise<Product> {
    this.logger.debug(
      `Create a product. Name: ${name}, category: ${category}, escription: ${description}, photoUrl: ${photoUrl}`,
    );

    const connection = this.em.getConnection();
    const legacyProducts: Product[] = await connection.execute(
      `select * from product where id is not null order by created_at`,
    );

    if (legacyProducts?.length >= this.MAX_LIMIT) {
      const ids = legacyProducts
        .splice(-1 * (this.MAX_LIMIT - 1))
        .map((x: Product) => x.id);

      await connection.execute('delete from product where id not in(?)', [
        ids,
      ]);
    }

    const c = new Product();
    c.name = name;
    c.category = category;
    c.photoUrl = photoUrl;
    c.description = description;

    await this.productsRepository.persistAndFlush(c);
    this.logger.debug(`Saved new product`);

    return c;
  }

  async count(query: string): Promise<string> {
    try {
      this.logger.debug(`Saved new product`);

      return (await this.em.getConnection().execute(query))[0].count as string;
    } catch (err) {
      this.logger.warn(`Failed to execute query. Error: ${err.message}`);
      return err.message;
    }
  }
}
