import { Controller, Logger, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SWAGGER_DESC_CREATE_SUBSCRIPTION } from './subscriptions.controller.swagger.desc';

@Controller('/api/subscriptions')
@ApiTags('Subscriptions controller')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  @Post()
  @ApiOperation({
    description: SWAGGER_DESC_CREATE_SUBSCRIPTION,
  })
  @ApiCreatedResponse({
    description: 'Returns subscribed email',
  })
  async subscribe(@Query('email') email: string): Promise<string> {
    this.logger.log(`Subscribed with email ${email}`);
    return email;
  }
}
