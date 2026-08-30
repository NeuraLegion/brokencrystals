import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { Product } from '../model/product.entity';

const ALLOWED_SORT_FIELDS = new Set(['views_count', 'name', 'category']);
const ALLOWED_SORT_DIRECTIONS = new Set(['asc', 'desc']);

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

    const safeSort = ALLOWED_SORT_FIELDS.has(sort) ? sort : 'views_count';
    const safeDirection = ALLOWED_SORT_DIRECTIONS.has(direction.toLowerCase())
      ? direction.toLowerCase()
      : 'desc';

    const query = `
      select *
      from product
      where category = ?
        and name <> ?
      order by ${safeSort} ${safeDirection}
      limit ?;
    `;
    const rows = await this.em
      .getConnection()
      .execute<Product[]>(query, [product.category, product.name, limit]);

    return rows.map((row: Product) => this.em.map(Product, row));
  }
}
