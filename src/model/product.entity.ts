// item.entity.ts
import { Entity, Property } from '@mikro-orm/core';
import { Base } from './base.entity';

@Entity()
export class Product extends Base {
  @Property()
  name: string;

  @Property()
  category: string;

  @Property()
  photoUrl: string;

  @Property()
  description: string;

  @Property()
  viewsCount: number
}
