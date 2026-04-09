import { FastifyReply } from 'fastify';
import {
  Controller,
  Delete,
  Get,
  Header,
  HttpStatus,
  Logger,
  Query,
  Res
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import {
  SWAGGER_DESC_DELTE_EMAILS,
  SWAGGER_DESC_GET_EMAILS,
  SWAGGER_DESC_SEND_EMAIL
} from './email.controller.swagger.desc';

@Controller('/api/email')
@ApiTags('Emails controller')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private emailService: EmailService) {}

  readonly BC_EMAIL_ADDRESS = 'no-reply@brokencrystals.com';

  @Get('/sendSupportEmail')
  @ApiQuery({
    name: 'name',
    example: 'Bob Dylan',
    required: true
  })
  @ApiQuery({
    name: 'to',
    example: 'username@email.com',
    required: true
  })
  @ApiQuery({
    name: 'subject',
    example: 'Help Request',
    required: true
  })
  @ApiQuery({
    name: 'content',
    example: 'I would like to request help regarding..',
    required: true
  })
  @ApiOperation({
    description: SWAGGER_DESC_SEND_EMAIL
  })
  @Header('Content-Type', 'application/json')
  async sendSupportEmail(
    @Query('name') name: string,
    @Query('to') to: string,
    @Query('subject') subject: string,
    @Query('content') content: string,
    @Query() query,
    @Res({ passthrough: true }) res: FastifyReply
  ) {
    this.logger.log('Sending a support Email');

    const responseJson = {
      message: {},
      status: HttpStatus.OK
    };

    // Preserve existing behavior without using unsafe query-object parsing.
    // Only use the explicit query parameter values provided by NestJS.
    const responseStatusRaw = query?.status;
    if (
      typeof responseStatusRaw === 'string' &&
      /^\d{3}$/.test(responseStatusRaw)
    ) {
      const parsedStatus = Number(responseStatusRaw);
      if (Object.values(HttpStatus).includes(parsedStatus)) {
        responseJson.status = parsedStatus as HttpStatus;
      }
    }

    const mailSubject = `Support email regarding "${subject}"`;
    const mailBody = `Hi ${name},\nWe recieved your email and just wanted to let you know we're on it!\n\nYour original inquiry was:\n**********************\n${content}\n**********************`;
    const didSucceed = await this.emailService.sendRawEmail(
      this.BC_EMAIL_ADDRESS,
      to,
      mailSubject,
      mailBody
    );

    if (didSucceed) {
      responseJson.message = `Email sent to "${name} <${to}>" successfully`;
      res.status(HttpStatus.OK);
    } else {
      responseJson.message = `Failed sending a support email. Or your exploit just ain't cutting it... Level up.`;
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return JSON.stringify(responseJson);
  }

  @Get('/getEmails')
  @ApiOperation({
    description: SWAGGER_DESC_GET_EMAILS
  })
  @ApiQuery({
    name: 'withSource',
    example: 'true',
    required: true
  })
  async getEmails(@Query('withSource') withSourceStr: string) {
    const withSource = withSourceStr === 'true';

    this.logger.log(`Getting Emails (withSource=${withSource})`);
    return await this.emailService.getEmails(withSource);
  }

  @Delete('/deleteEmails')
  @ApiOperation({
    description: SWAGGER_DESC_DELTE_EMAILS
  })
  async deleteEmails() {
    this.logger.log('Deleting Emails');
    return await this.emailService.deleteEmails();
  }
}
