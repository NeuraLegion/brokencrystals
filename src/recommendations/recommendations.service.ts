import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { Product } from '../model/product.entity';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: EntityRepository<Product>,
    private readonly em: EntityManager
  ) {}

  async findRelated(
    productName: string,
    limit: number,
    sort: string,
    direction: string
  ): Promise<Product[]> {
    this.logger.debug(
      `Finding recommendations for "${productName}" sorted by "${sort}" in "${direction}" order`
    );

    const product = await this.productsRepository.findOne({
      name: productName
    });
    if (!product) {
      return [];
    }

    const query = `
      select *
      from product
      where category = '${product.category}'
        and name <> '${product.name}'
      order by ${sort} ${direction}
      limit ${limit};
    `;
    const rows = await this.em.getConnection().execute<Product[]>(query);

    return rows.map((row: Product) => this.em.map(Product, row));
  }
}
