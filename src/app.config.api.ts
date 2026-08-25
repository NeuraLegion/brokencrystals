import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty()
  awsBucket: string;

  @ApiProperty()
  googlemaps: string;
}
