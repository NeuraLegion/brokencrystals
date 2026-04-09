import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { CreateTestimonialRequest } from './api/CreateTestimonialRequestREST';
import { TestimonialDto } from './api/TestimonialDto';
import {
  API_DESC_CREATE_TESTIMONIAL,
  API_DESC_GET_TESTIMONIALS,
  API_DESC_GET_TESTIMONIALS_ON_SQL_QUERY
} from './testimonials.controller.api.desc';
import { TestimonialsService } from './testimonials.service';

@Controller('/api/testimonials')
@ApiTags('Testimonials controller')
export class TestimonialsController {
  private readonly logger = new Logger(TestimonialsController.name);

  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Post()
  @ApiBody({
    type: TestimonialDto
  })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: API_DESC_CREATE_TESTIMONIAL
  })
  @ApiOkResponse({
    type: TestimonialDto
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' }
      }
    }
  })
  async createTestimonial(
    @Body() req: CreateTestimonialRequest
  ): Promise<CreateTestimonialRequest> {
    this.logger.debug('Create testimonial.');
    return TestimonialDto.covertToApi(
      await this.testimonialsService.createTestimonial(
        req.message,
        req.name,
        req.title
      )
    );
  }

  @Get()
  @ApiOperation({
    description: API_DESC_GET_TESTIMONIALS
  })
  @ApiOkResponse({
    type: TestimonialDto,
    isArray: true
  })
  async getTestimonials(): Promise<TestimonialDto[]> {
    this.logger.debug('Get all testimonials.');
    return (await this.testimonialsService.findAll()).map<TestimonialDto>(
      TestimonialDto.covertToApi
    );
  }

  @Get('count')
  @ApiQuery({
    name: 'query',
    example: 'testimonial',
    required: true
  })
  @ApiOperation({
    description: API_DESC_GET_TESTIMONIALS_ON_SQL_QUERY
  })
  @ApiOkResponse({
    type: String
  })
  async getCount(@Query('query') query: string): Promise<number> {
    this.logger.debug('Get count of testimonials.');
    return await this.testimonialsService.count(query);
  }

  @GrpcMethod('TestimonialsService', 'TestimonialsCount')
  async testimonialsCountGrpc(data: {
    query: string;
  }): Promise<{ count: number }> {
    const count = await this.testimonialsService.count(data.query);
    return { count };
  }
}
