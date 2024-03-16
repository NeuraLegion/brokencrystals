import { FastifyReply } from 'fastify';
import {
  Controller,
  HttpStatus,
  Logger,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { EmailService } from './email.service';
import { SWAGGER_DESC_SEND_EMAIL } from './email.controller.swagger.desc';

@Controller('/api/email')
@ApiTags('Email controller')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private emailService: EmailService) {}

  readonly bc_email_address = 'no-reply@brokencrystals.com';

  @Post('/sendEmail')
  @ApiQuery({
    name: 'to',
    example: 'username@email.com',
    required: true,
  })
  @ApiQuery({
    name: 'subject',
    example: 'Help Request',
    required: true,
  })
  @ApiQuery({
    name: 'content',
    example: 'I would like to request help regarding the matter of..',
    required: true,
  })
  @ApiOkResponse({
    description: 'Sent email successfully',
  })
  @ApiOperation({
    description: SWAGGER_DESC_SEND_EMAIL,
  })
  async sendEmail(
    @Query('to') to: string,
    @Query('subject') subject: string,
    @Query('content') content: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    let from = this.bc_email_address;
    let didSucceed = await this.emailService.sendRawEmail(
      from,
      to,
      subject,
      content,
    );

    return didSucceed
      ? res.status(HttpStatus.OK)
      : res.status(HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
