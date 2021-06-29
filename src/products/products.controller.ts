import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { CreateProductRequest } from './api/CreateProductRequest';
import { ProductDto } from './api/ProductDto';
import { ProductsService } from './products.service';

@Controller('/api/products')
@ApiTags('products controller')
export class ProductsController {
  private readonly logger = new Logger(ProductsController.name);

  constructor(private readonly productsService: ProductsService) {}

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Post()
  @ApiOperation({
    description: 'creates product',
  })
  @ApiResponse({
    type: ProductDto,
    status: 200,
  })
  async createProduct(
    @Body() req: CreateProductRequest,
  ): Promise<CreateProductRequest> {
    this.logger.debug('Create product.');
    return ProductDto.covertToApi(
      await this.productsService.createProduct(
        req.name,
        req.category,
        req.photoUrl,
        req.description,
      ),
    );
  }

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
    return (await this.productsService.findAll()).map<ProductDto>(
      ProductDto.covertToApi,
    );
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
    return (await this.productsService.findAll()).map<ProductDto>(
      ProductDto.covertToApi,
    ).slice(0, 3);
  }
}