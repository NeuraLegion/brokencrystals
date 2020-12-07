import { ApiProperty } from '@nestjs/swagger';

export class LoginRequest {
  @ApiProperty()
  user: string;

  @ApiProperty()
  password: string;
}
