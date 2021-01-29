import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../model/user.entity';

export class UserDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  firstName: string;

  @ApiProperty()
  lastName: string;

  public static convertToApi(user: User): UserDto {
    return {
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }
}
