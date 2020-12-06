import { Testimonial } from 'src/model/testimonial.entity';

export class ITestimonial {
  name: string;
  title: string;
  message: string;

  public static covertToApi(t: Testimonial): ITestimonial {
    return {
      message: t.message,
      name: t.name,
      title: t.title,
    };
  }
}
