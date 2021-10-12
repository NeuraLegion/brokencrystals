import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { CreateTestimonialRequest } from './api/CreateTestimonialRequest';
import { TestimonialDto } from './api/TestimonialDto';
import {
  SWAGGER_DESC_createTestimonial,
  SWAGGER_DESC_getTestimonials,
  SWAGGER_DESC_getTestimonialsOnSqlQuery,
} from './testimonials.controller.swagger.desc';
import { TestimonialsService } from './testimonials.service';

@Controller('/api/testimonials')
@ApiTags('Testimonials controller')
export class TestimonialsController {
  private readonly logger = new Logger(TestimonialsController.name);

  constructor(private readonly testimonialsService: TestimonialsService) {}

  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @Post()
  @ApiOperation({
    description: SWAGGER_DESC_createTestimonial,
  })
  @ApiOkResponse({
    type: TestimonialDto,
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
    description: SWAGGER_DESC_getTestimonials,
  })
  @ApiOkResponse({
    type: TestimonialDto,
    isArray: true,
  })
  async getTestimonials(): Promise<TestimonialDto[]> {
    this.logger.debug('Get all testimonials.');
    return (await this.testimonialsService.findAll()).map<TestimonialDto>(
      TestimonialDto.covertToApi,
    );
  }

  @Get('count')
  @ApiOperation({
    description: SWAGGER_DESC_getTestimonialsOnSqlQuery,
  })
  @ApiOkResponse({
    type: String,
  })
  async getCount(@Query('query') query: string): Promise<string> {
    this.logger.debug('Get count of testimonials.');
    return await this.testimonialsService.count(query);
  }
}
