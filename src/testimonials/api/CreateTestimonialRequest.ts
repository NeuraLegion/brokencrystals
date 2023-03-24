import { ApiProperty } from '@nestjs/swagger';
import { InputType, Field } from '@nestjs/graphql';

export class CreateTestimonialRequestREST {
  @ApiProperty()
  name: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  message: string;
}

@InputType()
export class CreateTestimonialRequestGQL {
  @Field()
  name: string;

  @Field()
  title: string;

  @Field()
  message: string;
}
