import { HighlightSubject } from '@mikro-orm/sql-highlighter/enums';
import { Body, Controller, Get, Logger, Post, Query } from '@nestjs/common';
import { get } from 'http';
import { CreateTestimonialRequest } from './api/CreateTestimonialRequest';
import { ITestimonial } from './api/ITestimonial';
import { TestimonialsService } from './testimonials.service';

@Controller('/api/testimonials')
export class TestimonialsController {
  private log: Logger = new Logger(TestimonialsController.name);

  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Post()
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
  async getTestimonials(): Promise<ITestimonial[]> {
    this.log.debug('Called createTestimonial');
    return await (await this.testimonialsService.findAll()).map<ITestimonial>(
      ITestimonial.covertToApi,
    );
  }

  @Get('count')
  async getCount(@Query('query') query: string): Promise<string> {
    this.log.debug('getCount');
    return await this.testimonialsService.count(query);
  }
}
