import { Controller, Get, Logger, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { ProductDto } from './api/ProductDto';
import { ProductsService } from './products.service';
import { Product } from '../model/product.entity';

@Controller('/api/products')
@ApiTags('products controller')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Get()
  @ApiOperation({
    description: 'returns all products',
  })
  @ApiResponse({
    type: ProductDto,
    isArray: true,
    status: 200,
  })
  async getProducts(): Promise<ProductDto[]> {
    this.logger.debug('Get all products.');
    const allProducts = await this.productsService.findAll();
    return allProducts.map((p: Product) => new ProductDto(p));
  }

  @Get('latest')
  @ApiOperation({
    description: 'returns 3 latest products',
  })
  @ApiResponse({
    type: ProductDto,
    isArray: true,
    status: 200,
  })
  async getLatestProducts(): Promise<ProductDto[]> {
    this.logger.debug('Get latest products.');
    const products = await this.productsService.findLatest(3);
    return products.map((p: Product) => new ProductDto(p));
  }
}
