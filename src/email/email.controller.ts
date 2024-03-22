import { FastifyReply } from 'fastify';
import {
  Controller,
  Delete,
  Get,
  Header,
  HttpStatus,
  Logger,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EmailService } from './email.service';
import {
  SWAGGER_DESC_DELTE_EMAILS,
  SWAGGER_DESC_GET_EMAILS,
  SWAGGER_DESC_SEND_EMAIL,
} from './email.controller.swagger.desc';
import splitUriIntoParamsPPVulnerable from '../utils/url';
import { boolean } from 'webidl-conversions';

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
    required: true,
  })
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
  @ApiOperation({
    description: SWAGGER_DESC_SEND_EMAIL,
  })
  @Header('Content-Type', 'application/json')
  async sendSupportEmail(
    @Query('name') name: string,
    @Query('to') to: string,
    @Query('subject') subject: string,
    @Query('content') content: string,
    @Query() query,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    this.logger.log('Sending a support Email');

    // This is defined here intentionally so we don't override responseJson.status after the prototype pollution has occurred
    let responseJson = {
      message: {},
      status: HttpStatus.OK,
    };

    // "Accidentally" forgot this here while coding... Oops.
    // A server side prototype pollution can be found in the `name` param
    // You can create a fake `status` variable and return a tempered response
    let rawQuery = '';
    for (const queryKey of Object.keys(query)) {
      if (query[queryKey].includes('proto')) {
        rawQuery += `&${queryKey}=${query[queryKey]}`;
      } else {
        rawQuery += encodeURI(`&${queryKey}=${query[queryKey]}`);
      }
    }
    // Remove the inital '&'
    rawQuery = `?${rawQuery.substring(1)}`;
    this.logger.debug(`Raw query ${rawQuery}`);

    // "Use" the status code
    let uriParams: any = splitUriIntoParamsPPVulnerable(rawQuery);
    if (uriParams?.status) {
      responseJson.status = uriParams.status;
    }

    const mailSubject = `Support email regarding "${subject}"`;
    const mailBody = `Hi ${name},\nWe recieved your email and just wanted to let you know we're on it!\n\nYour original inquiry was:\n**********************\n${content}\n**********************`;
    let didSucceed = await this.emailService.sendRawEmail(
      this.BC_EMAIL_ADDRESS,
      to,
      mailSubject,
      mailBody,
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
    description: SWAGGER_DESC_GET_EMAILS,
  })
  @ApiQuery({
    name: 'withSource',
    example: 'true',
    required: true,
  })
  async getEmails(@Query('withSource') withSource: any) {
    withSource = withSource === 'true';
    
    this.logger.log(`Getting Emails (withSource=${withSource})`);
    return await this.emailService.getEmails(withSource);
  }

  @Delete('/deleteEmails')
  @ApiOperation({
    description: SWAGGER_DESC_DELTE_EMAILS,
  })
  async deleteEmails() {
    this.logger.log('Deleting Emails');
    return await this.emailService.deleteEmails();
  }
}
