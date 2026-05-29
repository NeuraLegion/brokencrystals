import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty({ description: 'Non-sensitive configuration value' })
  sql: string;
}
