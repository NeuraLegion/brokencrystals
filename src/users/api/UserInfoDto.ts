import { ApiProperty } from '@nestjs/swagger';

export class UserInfoDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  constructor(
    params: {
      [P in keyof UserInfoDto]: UserInfoDto[P];
    },
  ) {
    Object.assign(this, params);
  }
}
