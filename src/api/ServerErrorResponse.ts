import { ApiProperty } from '@nestjs/swagger';

export class ServerErrorResponse {
  @ApiProperty()
  error: string;

  @ApiProperty()
  location: string;
}
