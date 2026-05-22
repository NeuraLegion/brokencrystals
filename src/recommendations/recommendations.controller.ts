import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Query
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import { ProductDto } from '../products/api/ProductDto';
import { Product } from '../model/product.entity';
import { API_DESC_GET_RELATED_RECOMMENDATIONS } from './recommendations.controller.api.desc';
import { RecommendationsService } from './recommendations.service';

@Controller('/api/recommendations')
@ApiTags('Recommendations controller')
export class RecommendationsController {
  private readonly logger = new Logger(RecommendationsController.name);

  constructor(
    private readonly recommendationsService: RecommendationsService
  ) {}

  @Get('related')
  @ApiQuery({
    name: 'product',
    example: 'Amethyst',
    required: true
  })
  @ApiQuery({
    name: 'limit',
    example: 3,
    required: false
  })
  @ApiQuery({
    name: 'sort',
    example: 'views_count',
    required: false
  })
  @ApiQuery({
    name: 'direction',
    example: 'desc',
    required: false
  })
  @ApiOperation({
    description: API_DESC_GET_RELATED_RECOMMENDATIONS
  })
  @ApiOkResponse({
    type: ProductDto,
    isArray: true
  })
  async getRelatedProducts(
    @Query('product') productName: string,
    @Query('limit') limitParam: string,
    @Query('sort') sort = 'views_count',
    @Query('direction') direction = 'desc'
  ): Promise<ProductDto[]> {
    this.logger.debug(`Get recommendations for product "${productName}"`);

    if (!productName) {
      throw new BadRequestException('Product name is required');
    }

    if (limitParam && isNaN(Number(limitParam))) {
      throw new BadRequestException('Limit must be a number');
    }

    const limit = limitParam ? Number(limitParam) : 3;
    if (limit <= 0) {
      throw new BadRequestException('Limit must be positive');
    }

    const products = await this.recommendationsService.findRelated(
      productName,
      limit,
      sort,
      direction
    );

    return products.map((product: Product) => new ProductDto(product));
  }
}
