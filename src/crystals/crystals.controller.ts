import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { CreateCrystalRequest } from './api/CreateCrystalRequest';
import { CrystalDto } from './api/CrystalDto';
import { CrystalsService } from './crystals.service';

@Controller('/api/crystals')
@ApiTags('crystals controller')
export class CrystalsController {
  private readonly logger = new Logger(CrystalsController.name);

  constructor(private readonly crystalsService: CrystalsService) {}

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Post()
  @ApiOperation({
    description: 'creates crystal',
  })
  @ApiResponse({
    type: CrystalDto,
    status: 200,
  })
  async createCrystal(
    @Body() req: CreateCrystalRequest,
  ): Promise<CreateCrystalRequest> {
    this.logger.debug('Create crystal.');
    return CrystalDto.covertToApi(
      await this.crystalsService.createCrystal(
        req.name,
        req.category,
        req.photo_URL,
        req.short_description,
      ),
    );
  }

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Get()
  @ApiOperation({
    description: 'returns all crystals',
  })
  @ApiResponse({
    type: CrystalDto,
    isArray: true,
    status: 200,
  })
  async getCrystals(): Promise<CrystalDto[]> {
    this.logger.debug('Get all crystals.');
    return (await this.crystalsService.findAll()).map<CrystalDto>(
      CrystalDto.covertToApi,
    );
  }

  @Get('latest')
  @ApiOperation({
    description: 'returns 3 latest crystals',
  })
  @ApiResponse({
    type: CrystalDto,
    isArray: true,
    status: 200,
  })
  async getLatestCrystals(): Promise<CrystalDto[]> {
    this.logger.debug('Get latest crystals.');
    return (await this.crystalsService.findAll()).map<CrystalDto>(
      CrystalDto.covertToApi,
    ).slice(0, 3);
  }
}
