import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Product } from '../model/product.entity';
import {
  RECOMMENDATIONS_ALLOWED_DIRECTIONS,
  RECOMMENDATIONS_SORT_FIELD_MAP
} from './recommendations.constants';

@Injectable()
export class RecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);

  constructor(
    @InjectRepository(Product)
    private readonly productsRepository: EntityRepository<Product>
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

    const sortField = RECOMMENDATIONS_SORT_FIELD_MAP[sort];
    if (!sortField) {
      throw new BadRequestException('Invalid sort field');
    }
    const normalizedDirection = direction.toLowerCase();
    if (!RECOMMENDATIONS_ALLOWED_DIRECTIONS.has(normalizedDirection)) {
      throw new BadRequestException('Invalid sort direction');
    }

    return this.productsRepository.find(
      {
        category: product.category,
        name: { $ne: product.name }
      },
      {
        limit,
        orderBy: {
          [sortField]: normalizedDirection
        }
      }
    );
  }
}
