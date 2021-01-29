import { ApiProperty } from '@nestjs/swagger';
import { Testimonial } from '../../model/testimonial.entity';

export class TestimonialDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  public static covertToApi(t: Testimonial): TestimonialDto {
    return {
      message: t.message,
      name: t.name,
      title: t.title,
    };
  }
}
