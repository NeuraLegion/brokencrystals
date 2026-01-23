import { Controller, Get, Logger, Query, BadRequestException } from '@nestjs/common';
import { ApiOperation, ApiOkResponse, ApiTags, ApiQuery } from '@nestjs/swagger';
import { ProductDto } from './api/ProductDto';
import { ProductsService } from './products.service';
import { Product } from '../model/product.entity';
import { API_DESC_GET_LATEST_PRODUCTS } from './products.controller.api.desc';

@Controller('/api/products')
@ApiTags('Products controller')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  @Get('latest')
  @ApiQuery({ name: 'limit', example: 3, required: false })
  @ApiOperation({
    description: API_DESC_GET_LATEST_PRODUCTS
  })
  @ApiOkResponse({
    type: ProductDto,
    isArray: true
  })
  async getLatestProducts(
    @Query('limit') limit: string
  ): Promise<ProductDto[]> {
    this.logger.debug('Get latest products.');
    const maxLimit = 10; // Set a maximum limit to prevent excessive data retrieval
    let effectiveLimit = 3; // Default limit

    if (limit) {
      const parsedLimit = parseInt(limit, 10);
      if (isNaN(parsedLimit) || parsedLimit <= 0) {
        throw new BadRequestException('Limit must be a positive number');
      }
      effectiveLimit = Math.min(parsedLimit, maxLimit);
    }

    const products = await this.productsService.findLatest(effectiveLimit);
    return products.map((p: Product) => new ProductDto(p));
  }
}