import { ApiProperty } from '@nestjs/swagger';

export class JwtValidationResponse {
  @ApiProperty()
  secret: string;
}
