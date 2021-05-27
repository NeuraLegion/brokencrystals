import { ApiProperty } from '@nestjs/swagger';
import { ClientType } from 'src/keycloak/keycloak.service';

export class OidcClientRequest {
  @ApiProperty({ enum: ClientType })
  type?: string;
}
