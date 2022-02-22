import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class UserDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  @Exclude()
  @ApiHideProperty()
  isAdmin?: boolean;

  @Exclude()
  @ApiHideProperty()
  password?: string;

  @Exclude()
  id: number;

  @Exclude()
  photo: Buffer;

  @Exclude()
  updatedAt: Date;

  @Exclude()
  createdAt: Date;

  constructor(
    params: {
      [P in keyof UserDto]: UserDto[P];
    },
  ) {
    Object.assign(this, params);
  }
}
