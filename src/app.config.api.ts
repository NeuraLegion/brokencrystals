import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty()
  databaseConfigured: boolean;

  @ApiProperty()
  mapsConfigured: boolean;

  @ApiProperty()
  storageConfigured: boolean;
}
