import {
  Controller,
  Get,
  Header,
  Logger,
  UseGuards,
  Headers,
  InternalServerErrorException,
  Query,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiOkResponse,
  ApiTags,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiHeader,
  ApiQuery,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { ProductDto } from './api/ProductDto';
import { ProductsService } from './products.service';
import { Product } from '../model/product.entity';
import {
  API_DESC_GET_LATEST_PRODUCTS,
  API_DESC_GET_PRODUCTS,
  API_DESC_GET_VIEW_PRODUCT,
} from './products.controller.api.desc';

@Controller('/api/products')
@ApiTags('Products controller')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: API_DESC_GET_PRODUCTS,
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
  @ApiQuery({ name: 'limit', example: 3, required: false })
  @ApiOperation({
    description: API_DESC_GET_LATEST_PRODUCTS,
  })
  @ApiOkResponse({
    type: ProductDto,
    isArray: true,
  })
  async getLatestProducts(
    @Query('limit') limit: number,
  ): Promise<ProductDto[]> {
    this.logger.debug('Get latest products.');
    if (limit && isNaN(limit)) {
      throw new BadRequestException('Limit must be a number');
    }
    if (limit && limit < 0) {
      throw new BadRequestException('Limit must be positive');
    }
    const products = await this.productsService.findLatest(limit || 3);
    return products.map((p: Product) => new ProductDto(p));
  }

  @Get('views')
  @ApiHeader({ name: 'x-product-name', example: 'Amethyst' })
  @ApiOperation({
    description: API_DESC_GET_VIEW_PRODUCT,
  })
  @ApiOkResponse()
  @ApiInternalServerErrorResponse({
    schema: {
      type: 'object',
      properties: {
        error: { type: 'string' },
        location: { type: 'string' },
      },
    },
  })
  async viewProduct(
    @Headers('x-product-name') productName: string,
  ): Promise<void> {
    try {
      const query = `UPDATE product SET views_count = views_count + 1 WHERE name = '${productName}'`;
      return await this.productsService.updateProduct(query);
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }
}
