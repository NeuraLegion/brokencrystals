import { ApiProperty } from '@nestjs/swagger';

export class IUserActionResult {
  @ApiProperty()
  success: boolean;
}
