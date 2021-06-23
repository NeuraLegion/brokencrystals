import { ApiProperty } from '@nestjs/swagger';

export class CreateCrystalRequest {
  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photo_URL: string;

  @ApiProperty()
  short_description: string;
}
