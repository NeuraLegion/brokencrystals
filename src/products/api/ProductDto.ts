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

  public static covertToApi(p: Product): ProductDto {
    return {
      name: p.name,
      category: p.category,
      photoUrl: p.photoUrl,
      description: p.description,
    };
  }
}
