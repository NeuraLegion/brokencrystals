import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty({ example: 'Amethyst', required: true })
  name: string;

  @ApiProperty({ example: 'Healing', required: true })
  category: string;

  @ApiProperty({
    default:
      '/api/file?path=config/products/crystals/amethyst.jpg&type=image/jpg',
    required: true,
  })
  photoUrl: string;

  @ApiProperty({ example: 'a violet variety of quartz', required: true })
  description: string;

  @ApiProperty({ example: 1, required: true })
  viewsCount: number;

  constructor(params: {
    name: string;
    category: string;
    photoUrl: string;
    description: string;
    viewsCount: number;
  }) {
    Object.assign(this, params);
  }
}
