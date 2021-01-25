import { ApiProperty } from '@nestjs/swagger';
import { Testimonial } from '../../model/testimonial.entity';

export class ITestimonial {
  @ApiProperty()
  name: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;

  public static covertToApi(t: Testimonial): ITestimonial {
    return {
      message: t.message,
      name: t.name,
      title: t.title,
    };
  }
}
