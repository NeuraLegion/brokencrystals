import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from './UserDto';

export enum SignupMode {
  BASIC = 'basic',
  OIDC = 'oidc',
}

export class CreateUserRequest extends UserDto {
  @ApiProperty()
  company: string;
  @ApiProperty()
  cardNumber: string;
  @ApiProperty()
  phoneNumber: string;
  @ApiProperty()
  password: string;
  op: SignupMode;
}
