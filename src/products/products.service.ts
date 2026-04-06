import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../model/product.entity';

@Injectable()
export class ProductsService {
  constructor(@InjectRepository(Product) private productsRepository: Repository<Product>) {}

  async findAll(from: Date, to: Date): Promise<Product[]> {
    return this.productsRepository.find({
      where: { createdDate: { $gte: from, $lte: to } }
    });
  }

  async findLatest(limit: number): Promise<Product[]> {
    return this.productsRepository.find({
      order: { createdDate: 'DESC' },
      take: limit
    });
  }

  async searchByName(name: string): Promise<Product[]> {
    return this.productsRepository.find({ where: { name: name } });
  }

  async incrementViewCount(productName: string): Promise<void> {
    await this.productsRepository.createQueryBuilder()
      .update(Product)
      .set({ viewsCount: () => "viewsCount + 1" })
      .where("name = :name", { name: productName })
      .execute();
  }
}
