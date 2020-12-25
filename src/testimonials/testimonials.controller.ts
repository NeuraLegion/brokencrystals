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
import { AuthGuard } from 'src/auth/auth.guard';
import { JwtProcessorType } from 'src/auth/auth.service';
import { JwtType } from 'src/auth/jwt/jwt.type.decorator';
import { CreateTestimonialRequest } from './api/CreateTestimonialRequest';
import { ITestimonial } from './api/ITestimonial';
import { TestimonialsService } from './testimonials.service';

@Controller('/api/testimonials')
@ApiTags('testimonials controller')
export class TestimonialsController {
  private log: Logger = new Logger(TestimonialsController.name);

  constructor(private readonly testimonialsService: TestimonialsService) {}

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Post()
  @ApiOperation({
    description: 'creates testimonial',
  })
  @ApiResponse({
    type: ITestimonial,
    status: 200
  })
  async createTestimonial(
    @Body() req: CreateTestimonialRequest,
  ): Promise<CreateTestimonialRequest> {
    this.log.debug('Called createTestimonial');
    return ITestimonial.covertToApi(
      await this.testimonialsService.createTestimonial(
        req.message,
        req.name,
        req.title,
      ),
    );
  }

  @Get()
  @ApiOperation({
    description: 'returns all testimonials',
  })
  @ApiResponse({
    type: ITestimonial,
    isArray: true,
    status: 200
  })
  async getTestimonials(): Promise<ITestimonial[]> {
    this.log.debug('Called createTestimonial');
    return await (await this.testimonialsService.findAll()).map<ITestimonial>(
      ITestimonial.covertToApi,
    );
  }

  @Get('count')
  @ApiOperation({
    description:
      'returns count of all testimnonials based on provided sql query',
  })
  @ApiResponse({
    type: String,
    status: 200
  })
  async getCount(@Query('query') query: string): Promise<string> {
    this.log.debug('getCount');
    return await this.testimonialsService.count(query);
  }
}
