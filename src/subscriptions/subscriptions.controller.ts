import { Controller, Logger, Post, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOperation,
  ApiQuery,
  ApiTags
} from '@nestjs/swagger';
import { SWAGGER_DESC_CREATE_SUBSCRIPTION } from './subscriptions.controller.swagger.desc';

@Controller('/api/subscriptions')
@ApiTags('Subscriptions controller')
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  @Post()
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      validateCustomDecorators: true
    })
  )
  @ApiQuery({
    name: 'email',
    example: 'john.doe@example.com',
    required: true
  })
  @ApiOperation({
    description: SWAGGER_DESC_CREATE_SUBSCRIPTION
  })
  @ApiCreatedResponse({
    description: 'Subscription accepted'
  })
  async subscribe(@Query('email') email: string): Promise<{ success: boolean }> {
    this.logger.log('Subscription request received');
    return { success: true };
  }
}
