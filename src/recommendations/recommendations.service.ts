import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { Injectable, Logger } from '@nestjs/common';
import { Product } from '../model/product.entity';

export enum RecommendationsSort {
  VIEWS_COUNT = 'views_count'
}

export enum RecommendationsDirection {
  ASC = 'asc',
  DESC = 'desc'
}

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
    sort: RecommendationsSort,
    direction: RecommendationsDirection
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

    const sortColumnMap: Record<RecommendationsSort, string> = {
      [RecommendationsSort.VIEWS_COUNT]: 'views_count'
    };
    const directionKeywordMap: Record<RecommendationsDirection, 'asc' | 'desc'> = {
      [RecommendationsDirection.ASC]: 'asc',
      [RecommendationsDirection.DESC]: 'desc'
    };

    const safeSort = sortColumnMap[sort];
    const safeDirection = directionKeywordMap[direction];

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
