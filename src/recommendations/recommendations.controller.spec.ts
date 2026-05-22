import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Product } from '../model/product.entity';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  const recommendationsServiceMock = {
    findRelated: jest.fn()
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        {
          provide: RecommendationsService,
          useValue: recommendationsServiceMock
        }
      ]
    }).compile();

    controller = module.get<RecommendationsController>(RecommendationsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('throws when product is missing', async () => {
    await expect(controller.getRelatedProducts(undefined, undefined, undefined, undefined)).rejects.toThrow(
      new BadRequestException('Product name is required')
    );
  });

  it('throws when limit is not a number', async () => {
    await expect(controller.getRelatedProducts('Amethyst', 'abc', undefined, undefined)).rejects.toThrow(
      new BadRequestException('Limit must be a number')
    );
  });

  it('throws when limit is not positive', async () => {
    await expect(controller.getRelatedProducts('Amethyst', '0', undefined, undefined)).rejects.toThrow(
      new BadRequestException('Limit must be positive')
    );
  });

  it('uses defaults and maps response to DTOs', async () => {
    const product = {
      name: 'Rose Quartz',
      category: 'Healing',
      photoUrl: '/photo.jpg',
      description: 'Description',
      viewsCount: 10
    } as Product;
    recommendationsServiceMock.findRelated.mockResolvedValue([product]);

    const result = await controller.getRelatedProducts('Amethyst', undefined, undefined, undefined);

    expect(recommendationsServiceMock.findRelated).toHaveBeenCalledWith('Amethyst', 3, 'views_count', 'desc');
    expect(result).toEqual([
      {
        name: 'Rose Quartz',
        category: 'Healing',
        photoUrl: '/photo.jpg',
        description: 'Description',
        viewsCount: 10
      }
    ]);
  });
});
