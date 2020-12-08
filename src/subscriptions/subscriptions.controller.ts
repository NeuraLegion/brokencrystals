import { Controller, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@Controller('/api/subscriptions')
@ApiTags('subscriptions controller')
export class SubscriptionsController {
  @Post()
  @ApiOperation({
    description:
      'creates subscription for provided email and returns the email address',
  })
  async subscribe(@Query('email') email: string): Promise<string> {
    console.log('Subscribed with email ' + email);
    return email;
  }
}
