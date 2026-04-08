import { ApiPropertyOptional } from '@nestjs/swagger';

export class AppConfig {
  @ApiPropertyOptional({
    description: 'No public secrets are exposed by this endpoint'
  })
  public readonly publicConfig?: never;
}
