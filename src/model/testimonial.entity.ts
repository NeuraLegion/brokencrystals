// item.entity.ts
import { Entity, Property } from '@mikro-orm/core';
import { Base } from './base.entity';

@Entity()
export class Testimonial extends Base {
  @Property()
  name: string;

  @Property()
  title: string;

  @Property()
  message: string;
}
