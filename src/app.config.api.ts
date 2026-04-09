import { ApiProperty } from '@nestjs/swagger';

export class AppConfig {
  @ApiProperty({
    description: 'Public S3 bucket name or similar non-sensitive public configuration'
  })
  awsBucket: string;

  @ApiProperty({
    description: 'Public Google Maps API key or other non-secret public configuration'
  })
  googlemaps: string;
}
