import { ApiProperty } from '@nestjs/swagger';

export class CreateProductRequest {
  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photoUrl: string;

  @ApiProperty()
  description: string;
}
