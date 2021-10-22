import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiTags,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { ProductDto } from './api/ProductDto';
import { ProductsService } from './products.service';
import { Product } from '../model/product.entity';
import {
  SWAGGER_DESC_GET_LATEST_PRODUCTS,
  SWAGGER_DESC_GET_PRODUCTS,
} from './products.controller.swagger.desc';

@Controller('/api/products')
@ApiTags('Products controller')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: SWAGGER_DESC_GET_PRODUCTS,
  })
  @ApiOkResponse({
    type: ProductDto,
    isArray: true,
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  })
  async getProducts(): Promise<ProductDto[]> {
    this.logger.debug('Get all products.');
    const allProducts = await this.productsService.findAll();
    return allProducts.map((p: Product) => new ProductDto(p));
  }

  @Get('latest')
  @ApiOperation({
    description: SWAGGER_DESC_GET_LATEST_PRODUCTS,
  })
  @ApiOkResponse({
    type: ProductDto,
    isArray: true,
  })
  async getLatestProducts(): Promise<ProductDto[]> {
    this.logger.debug('Get latest products.');
    const products = await this.productsService.findLatest(3);
    return products.map((p: Product) => new ProductDto(p));
  }
}
