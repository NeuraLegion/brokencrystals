import { ApiProperty } from '@nestjs/swagger';

export class CreateTestimonialRequest {
  @ApiProperty()
  name: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;
}
