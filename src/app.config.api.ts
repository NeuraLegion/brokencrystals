import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty()
  googlemaps: string;
}
