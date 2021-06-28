import { ApiProperty } from '@nestjs/swagger';

export class CreateCrystalRequest {
  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photoUrl: string;

  @ApiProperty()
  description: string;
}
