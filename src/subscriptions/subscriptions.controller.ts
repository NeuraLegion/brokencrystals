import { Controller, Logger, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('/api/subscriptions')
@ApiTags('subscriptions controller')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  @Post()
  @ApiOperation({
    description:
      'creates subscription for provided email and returns the email address',
  })
  async subscribe(@Query('email') email: string): Promise<string> {
    this.logger.log(`Subscribed with email ${email}`);
    return email;
  }
}
