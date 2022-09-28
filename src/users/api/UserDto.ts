import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export const BASIC_USER_INFO = 'basicUserInfo';
export const FULL_USER_INFO = 'fullUserInfo';

export class UserDto {
  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty()
  email: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty()
  firstName: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty()
  lastName: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty()
  company: string;

  @Expose({ groups: [FULL_USER_INFO] })
  cardNumber: string;

  @Expose({ groups: [FULL_USER_INFO] })
  phoneNumber: string;

  @Exclude()
  @ApiHideProperty()
  isAdmin?: boolean;

  @Exclude()
  @ApiHideProperty()
  password?: string;

  @Exclude()
  @ApiHideProperty()
  id: number;

  @Exclude()
  photo: Buffer;

  @Expose({ groups: [FULL_USER_INFO] })
  updatedAt: Date;

  @Expose({ groups: [FULL_USER_INFO] })
  createdAt: Date;

  constructor(
    params: {
      [P in keyof UserDto]: UserDto[P];
    },
  ) {
    Object.assign(this, params);
  }
}
