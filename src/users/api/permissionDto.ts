import { ApiProperty } from '@nestjs/swagger';

export class permissionDto {
  @ApiProperty()
  isAdmin!: boolean;
}
