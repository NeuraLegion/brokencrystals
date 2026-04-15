import { InternalServerErrorException, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { Query, Mutation, Resolver, Args } from '@nestjs/graphql';
import { Product } from './api/product.model';
import { ProductDto } from './api/ProductDto';
import { ProductsService } from './products.service';
import {
  API_DESC_GET_LATEST_PRODUCTS,
  API_DESC_GET_PRODUCTS,
  API_DESC_GET_VIEW_PRODUCT
} from './products.controller.api.desc';

@Resolver(() => Product)
export class ProductsResolver {
  constructor(private readonly productsService: ProductsService) {}

  @Query(() => [Product], { description: API_DESC_GET_PRODUCTS })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  async allProducts(): Promise<Product[]> {
    const allProducts = await this.productsService.findAll();
    return allProducts.map((p: Product) => new ProductDto(p));
  }

  @Query(() => [Product], {
    description: API_DESC_GET_LATEST_PRODUCTS
  })
  async latestProducts(@Args('limit', { type: () => Number, nullable: true }) limit: number = 10): Promise<Product[]> {
    const maxLimit = 10; // Define the maximum limit here as well
    const effectiveLimit = Math.min(limit, maxLimit);
    const products = await this.productsService.findLatest(effectiveLimit);
    return products.map((p: Product) => new ProductDto(p));
  }

  @Mutation(() => Boolean, {
    description: API_DESC_GET_VIEW_PRODUCT
  })
  async viewProduct(
    @Args('productName') productName: string
  ): Promise<boolean> {
    try {
      await this.productsService.updateProduct(productName);
      return true;
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message
      });
    }
  }
}