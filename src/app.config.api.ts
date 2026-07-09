import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty()
  dbHost: string;

  @ApiProperty()
  dbPort: string;

  @ApiProperty()
  dbSchema: string;
}
