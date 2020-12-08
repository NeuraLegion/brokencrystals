import { ApiProperty } from '@nestjs/swagger';
import { IUser } from './IUser';

export class CreateUserRequest extends IUser {
  @ApiProperty()
  password: string;
}
