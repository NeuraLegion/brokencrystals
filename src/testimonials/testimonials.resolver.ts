import {
  InternalServerErrorException,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { JwtProcessorType } from '../auth/auth.service';
import { JwtType } from '../auth/jwt/jwt.type.decorator';
import { Query, Mutation, Resolver, Args, Int } from '@nestjs/graphql';
import { Testimonial } from './api/testimonial.model';
import { TestimonialDto } from './api/TestimonialDto';
import { TestimonialsService } from './testimonials.service';
import { CreateTestimonialRequest } from './api/CreateTestimonialRequestGQL';
import {
  API_DESC_CREATE_TESTIMONIAL,
  API_DESC_GET_TESTIMONIALS,
  API_DESC_GET_TESTIMONIALS_ON_SQL_QUERY,
} from './testimonials.controller.api.desc';

@Resolver(() => Testimonial)
export class TestimonialsResolver {
  private readonly logger = new Logger(TestimonialsResolver.name);

  constructor(private readonly testimonialsService: TestimonialsService) {}

  @Query(() => [Testimonial], {
    description: API_DESC_GET_TESTIMONIALS,
  })
  async allTestimonials(): Promise<Testimonial[]> {
    this.logger.debug('Get all testimonials');
    return (await this.testimonialsService.findAll()).map<TestimonialDto>(
      TestimonialDto.covertToApi,
    );
  }

  @Query(() => Int, {
    description: API_DESC_GET_TESTIMONIALS_ON_SQL_QUERY,
  })
  testimonialsCount(@Args('query') query: string): Promise<number> {
    this.logger.debug('Get count of testimonials');
    return this.testimonialsService.count(query);
  }

  @Mutation(() => Testimonial, {
    description: API_DESC_CREATE_TESTIMONIAL,
  })
  @UseGuards(AuthGuard)
  @JwtType(JwtProcessorType.RSA)
  async createTestimonial(
    @Args('testimonialRequest') testimonialRequest: CreateTestimonialRequest,
  ) {
    this.logger.debug('Create testimonial');
    try {
      return TestimonialDto.covertToApi(
        await this.testimonialsService.createTestimonial(
          testimonialRequest.message,
          testimonialRequest.name,
          testimonialRequest.title,
        ),
      );
    } catch {
      throw InternalServerErrorException;
    }
  }
}
