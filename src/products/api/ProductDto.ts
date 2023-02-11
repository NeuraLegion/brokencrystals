import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photoUrl: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  viewsCount: string;

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
