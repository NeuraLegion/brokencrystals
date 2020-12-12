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
import { CreateTestimonialRequest } from './api/CreateTestimonialRequest';
import { ITestimonial } from './api/ITestimonial';
import { TestimonialsService } from './testimonials.service';

@Controller('/api/testimonials')
@ApiTags('testimonials controller')
export class TestimonialsController {
  private log: Logger = new Logger(TestimonialsController.name);

  constructor(private readonly testimonialsService: TestimonialsService) {}

  @UseGuards(AuthGuard)
  @Post()
  @ApiOperation({
    description: 'creates testimonial',
  })
  @ApiResponse({
    type: ITestimonial,
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
  })
  async getCount(@Query('query') query: string): Promise<string> {
    this.log.debug('getCount');
    return await this.testimonialsService.count(query);
  }
}
