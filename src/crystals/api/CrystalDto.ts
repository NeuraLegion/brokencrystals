import { ApiProperty } from '@nestjs/swagger';
import { Crystal } from '../../model/crystal.entity';

export class CrystalDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  category: string;

  @ApiProperty()
  photo_URL: string;

  @ApiProperty()
  short_description: string;

  public static covertToApi(c: Crystal): CrystalDto {
    return {
      name: c.name,
      category: c.category,
      photo_URL: c.photo_URL,
      short_description: c.short_description,
    };
  }
}
