import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from './UserDto';

export class CreateUserRequest extends UserDto {
  @ApiProperty()
  company: string;
  @ApiProperty()
  cardNumber: string;
  @ApiProperty()
  phoneNumber: string;
  @ApiProperty()
  password: string;
  op: string;
}
