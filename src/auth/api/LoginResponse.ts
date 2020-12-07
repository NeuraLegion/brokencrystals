import { ApiProduces, ApiProperty } from '@nestjs/swagger';

export class LoginResponse {
  @ApiProperty()
  email: string;

  @ApiProperty()
  ldapProfileLink: string;
}
