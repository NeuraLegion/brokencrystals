import { FastifyReply } from 'fastify';
import {
  Controller,
  Get,
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
import { SWAGGER_DESC_DELTE_EMAILS, SWAGGER_DESC_GET_EMAILS, SWAGGER_DESC_SEND_EMAIL } from './email.controller.swagger.desc';

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
    example: 'I would like to request help regarding..',
    required: true,
  })
  @ApiOkResponse({
    description: 'Email sent successfully',
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

  @Get('/getEmails')
  @ApiOperation({
    description: SWAGGER_DESC_GET_EMAILS,
  })
  async getEmails() {
    return await this.emailService.getEmails();
  }

  @Get('/deleteEmails')
  @ApiOperation({
    description: SWAGGER_DESC_DELTE_EMAILS,
  })
  async deleteEmails() {
    return await this.emailService.deleteEmails();
  }
}
