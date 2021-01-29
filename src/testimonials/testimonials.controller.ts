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
import { CreateTestimonialRequest } from './api/CreateTestimonialRequest';
import { TestimonialDto } from './api/TestimonialDto';
import { TestimonialsService } from './testimonials.service';

@Controller('/api/testimonials')
@ApiTags('testimonials controller')
export class TestimonialsController {
  private readonly logger = new Logger(TestimonialsController.name);

  constructor(private readonly testimonialsService: TestimonialsService) {}

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Post()
  @ApiOperation({
    description: 'creates testimonial',
  })
  @ApiResponse({
    type: TestimonialDto,
    status: 200,
  })
  async createTestimonial(
    @Body() req: CreateTestimonialRequest,
  ): Promise<CreateTestimonialRequest> {
    this.logger.debug('Create testimonial.');
    return TestimonialDto.covertToApi(
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
    type: TestimonialDto,
    isArray: true,
    status: 200,
  })
  async getTestimonials(): Promise<TestimonialDto[]> {
    this.logger.debug('Get all testimonials.');
    return (await this.testimonialsService.findAll()).map<TestimonialDto>(
      TestimonialDto.covertToApi,
    );
  }

  @Get('count')
  @ApiOperation({
    description:
      'returns count of all testimonials based on provided sql query',
  })
  @ApiResponse({
    type: String,
    status: 200,
  })
  async getCount(@Query('query') query: string): Promise<string> {
    this.logger.debug('Get count of testimonials.');
    return await this.testimonialsService.count(query);
  }
}
