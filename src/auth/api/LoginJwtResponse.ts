import { ApiProperty } from '@nestjs/swagger';

export class LoginJwtResponse {
  @ApiProperty()
  token: string;

  @ApiProperty()
  email: string;

  @ApiProperty({
    description: 'ldap query link for user details',
  })
  ldapProfileLink: string;
}
