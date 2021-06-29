import { ApiProperty } from '@nestjs/swagger';
import { Crystal } from '../../model/crystal.entity';

export class CrystalDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photoUrl: string;

  @ApiProperty()
  description: string;

  public static covertToApi(c: Crystal): CrystalDto {
    return {
      name: c.name,
      category: c.category,
      photoUrl: c.photoUrl,
      description: c.description,
    };
  }
}
