import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';

export class FullUserDto {
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

  @ApiProperty()
  id: number;

  @Exclude()
  photo: Buffer;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  company: string;

  @ApiProperty()
  cardNumber: string;

  @ApiProperty()
  phoneNumber: string;

  constructor(
    params: {
      [P in keyof FullUserDto]: FullUserDto[P];
    },
  ) {
    Object.assign(this, params);
  }
}
