import {
  Body,
  Controller,
  Get,
  Header,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBody,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { CreateTestimonialRequest } from './api/CreateTestimonialRequestREST';
import { TestimonialDto } from './api/TestimonialDto';
import {
  API_DESC_CREATE_TESTIMONIAL,
  API_DESC_GET_TESTIMONIALS,
  API_DESC_GET_TESTIMONIALS_ON_SQL_QUERY,
  API_DESC_GET_TESTIMONIAL_AUTHORS,
} from './testimonials.controller.api.desc';
import { TestimonialsService } from './testimonials.service';

var xpath = require('xpath');

@Controller('/api/testimonials')
@ApiTags('Testimonials controller')
export class TestimonialsController {
  private readonly logger = new Logger(TestimonialsController.name);

  constructor(private readonly testimonialsService: TestimonialsService) { }

  @Post()
  @ApiBody({
    type: TestimonialDto,
  })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  @ApiOperation({
    description: API_DESC_CREATE_TESTIMONIAL,
  })
  @ApiOkResponse({
    type: TestimonialDto,
  })
  @ApiForbiddenResponse({
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
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
    description: API_DESC_GET_TESTIMONIAL_AUTHORS,
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
  @ApiQuery({
    name: 'query',
    example: 'select count(*) as count from testimonial',
    required: true,
  })
  @Header('content-type', 'text/html')
  @ApiOperation({
    description: API_DESC_GET_TESTIMONIALS_ON_SQL_QUERY,
  })
  @ApiOkResponse({
    type: String,
  })
  async getCount(@Query('query') query: string): Promise<number> {
    this.logger.debug('Get count of testimonials.');
    return await this.testimonialsService.count(query);
  }

  // WIP: XPATH Injection (place in hierarchy is probably wrong)
  @Get('authors')
  @Header('content-type', 'text/xml')
  @ApiOperation({
    description: API_DESC_GET_TESTIMONIALS_ON_SQL_QUERY,
  })
  @ApiOkResponse({
    type: String,
  })
  async get(@Query('query') query: string): Promise<String> {
    this.logger.debug(`Get testimonials' authors using query ${query}`);

    const XML_AUTHORS_STR: string = `
    <?xml version="1.0" encoding="UTF-8"?>
      <authors>
        <author>
          <name>John Bill</name>
          <age>23</age>
          <profession>Programmer</profession>
          <geolocation country="US" city="New York" />
        </author>

        <author>
          <name>Anna Meir</name>
          <age>28</age>
          <profession>Security Analyst</profession>
          <geolocation country="IL" city="Haifa" />
        </author>
      </authors>
    `;

    let xmlAuthorsObj = new DOMParser().parseFromString(XML_AUTHORS_STR, "text/xml");

    // XPath Parsers - TODO: install xpath in npm
    const select = xpath.useNamespaces({ mynamespace: "http://www.w3.org/1999/xhtml" });
    const nodes = select('//mynamespace:div', doc);

    return "XML";
    // return await this.testimonialsService.count(query);
  }
}
