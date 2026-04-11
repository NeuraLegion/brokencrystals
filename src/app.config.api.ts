import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty({
    description: 'Public non-sensitive bucket name used by the application'
  })
  awsBucket: string;
}
