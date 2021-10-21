import { ApiProperty } from '@nestjs/swagger';

export class BadRequestResponse {
  @ApiProperty()
  statusCode: string;

  @ApiProperty()
  message: string;

  @ApiProperty()
  error: string;
}
