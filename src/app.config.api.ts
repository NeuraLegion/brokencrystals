import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty()
  awsBucket: string;

  @ApiProperty()
  sql: string;

  @ApiProperty()
  googlemaps: string;
}
