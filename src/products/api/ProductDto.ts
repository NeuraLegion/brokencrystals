import { ApiProperty } from '@nestjs/swagger';
import { Product } from '../../model/product.entity';

export class ProductDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photoUrl: string;

  @ApiProperty()
  description: string;

  public static covertToApi(c: Product): ProductDto {
    return {
      name: c.name,
      category: c.category,
      photoUrl: c.photoUrl,
      description: c.description,
    };
  }
}
