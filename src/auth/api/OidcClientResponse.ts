import { ApiProperty } from '@nestjs/swagger';

export class OidcClientResponse {
  @ApiProperty()
  clientId: string;

  @ApiProperty()
  clientSecret: string;

  @ApiProperty()
  metadataUrl: string;
}
