import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType({ description: 'product ' })
export class Product {
  @Field({ description: 'Product name' })
  name: string;

  @Field({ description: 'Product category' })
  category: string;

  @Field({ description: 'Product photo URL' })
  photoUrl: string;

  @Field({ description: 'Product description' })
  description: string;

  @Field(() => Int, { description: 'Product views count' })
  viewsCount: number;
}
