import { Test, TestingModule } from '@nestjs/testing';
import { CrystalsService } from './crystals.service';

describe('CrystalsService', () => {
  let service: CrystalsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CrystalsService],
    }).compile();

    service = module.get<CrystalsService>(CrystalsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
