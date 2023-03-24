import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'testimonial ' })
export class Testimonial {
  @Field({ description: 'Testimonial author name' })
  name: string;

  @Field({ description: 'Testimonial title' })
  title: string;

  @Field({ description: 'Testimonial message' })
  message: string;
}
