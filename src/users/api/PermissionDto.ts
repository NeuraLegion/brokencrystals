import { ApiProperty } from '@nestjs/swagger';

export class PermissionDto {
  @ApiProperty()
  isAdmin!: boolean;

  constructor(params: Partial<PermissionDto>) {
    Object.assign(this, params);
  }
}
