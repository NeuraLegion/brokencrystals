import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from './UserDto';

export class CreateUserRequest extends UserDto {
  @ApiProperty()
  password: string;
  op: string;
}
