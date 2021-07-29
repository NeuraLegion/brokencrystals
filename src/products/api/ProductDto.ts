import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  constructor(params: {
    name: string;
    category: string;
    photoUrl: string;
    description: string;
  }) {
    Object.assign(this, params);
  }

  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photoUrl: string;

  @ApiProperty()
  description: string;
}
