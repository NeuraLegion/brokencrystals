import { ApiProperty } from '@nestjs/swagger';
import { Testimonial } from '../../model/testimonial.entity';

export class TestimonialDto {
  @ApiProperty({ example: 'John', required: true })
  name: string;

  @ApiProperty({ example: 'Doe', required: true })
  title: string;

  @ApiProperty({ example: "I've broken all the crystals", required: true })
  message: string;

  public static covertToApi(t: Testimonial): TestimonialDto {
    return {
      message: t.message,
      name: t.name,
      title: t.title,
    };
  }
}
