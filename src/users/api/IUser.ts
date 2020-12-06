import { ApiProperty } from '@nestjs/swagger';

export class IUser {
  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;
}
