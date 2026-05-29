import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty()
  sql: string;

  @ApiProperty()
  googlemaps: string;
}
