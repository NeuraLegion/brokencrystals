import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateTestimonialRequest {
  @Field()
  name: string;

  @Field()
  title: string;

  @Field()
  message: string;
}
