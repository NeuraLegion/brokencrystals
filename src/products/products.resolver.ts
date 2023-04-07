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
  API_DESC_GET_VIEW_PRODUCT,
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
    description: API_DESC_GET_LATEST_PRODUCTS,
  })
  async latestProducts(): Promise<Product[]> {
    const products = await this.productsService.findLatest(3);
    return products.map((p: Product) => new ProductDto(p));
  }

  @Mutation(() => Boolean, {
    description: API_DESC_GET_VIEW_PRODUCT,
  })
  async viewProduct(
    @Args('productName') productName: string,
  ): Promise<boolean> {
    try {
      const query = `UPDATE product SET views_count = views_count + 1 WHERE name = '${productName}'`;
      await this.productsService.updateProduct(query);
      return true;
    } catch (err) {
      throw new InternalServerErrorException({
        error: err.message,
        location: __filename,
      });
    }
  }
}
