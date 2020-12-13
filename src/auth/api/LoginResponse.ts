import { ApiProperty } from '@nestjs/swagger';

export class LoginResponse {
  @ApiProperty()
  email: string;

  @ApiProperty({
    description: 'ldap query link for user details',
  })
  ldapProfileLink: string;
}
