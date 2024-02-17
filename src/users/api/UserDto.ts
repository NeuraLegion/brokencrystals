import { ApiHideProperty, ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export const BASIC_USER_INFO = 'basicUserInfo';
export const FULL_USER_INFO = 'fullUserInfo';

export class UserDto {
  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty({ example: 'john.doe@examle.com', required: true })
  email: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty({ example: 'John', required: true })
  firstName: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty({ example: 'Doe', required: true })
  lastName: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty({ example: 'Bright Security', required: true })
  company: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty({ example: 1 })
  id: number;

  @Expose({ groups: [FULL_USER_INFO] })
  @ApiProperty({ example: '4263982640269299' })
  cardNumber: string;

  @Expose({ groups: [BASIC_USER_INFO, FULL_USER_INFO] })
  @ApiProperty({ example: '12065550100' })
  phoneNumber: string;

  @Exclude()
  @ApiHideProperty()
  isAdmin?: boolean;

  @Exclude()
  @ApiHideProperty()
  @ApiProperty({ example: 'Pa55w0rd' })
  password?: string;

  @Exclude()
  photo: Buffer;

  @Expose({ groups: [FULL_USER_INFO] })
  updatedAt: Date;

  @Expose({ groups: [FULL_USER_INFO] })
  createdAt: Date;

  @Exclude()
  isBasic: boolean;

  constructor(params: UserDto) {
    Object.assign(this, params);
  }
}
