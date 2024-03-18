import splitUriIntoParamsPPVulnerable from '../../client/src/utils/url';

import { FastifyReply } from 'fastify';
import {
  Controller,
  Delete,
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
import {
  SWAGGER_DESC_DELTE_EMAILS,
  SWAGGER_DESC_GET_EMAILS,
  SWAGGER_DESC_SEND_EMAIL,
} from './email.controller.swagger.desc';

@Controller('/api/email')
@ApiTags('Email controller')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private emailService: EmailService) {}

  readonly BC_EMAIL_ADDRESS = 'no-reply@brokencrystals.com';

  @Post('/sendSupportEmail')
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
  async sendSupportEmail(
    @Query('name') name: string,
    @Query('to') to: string,
    @Query('subject') subject: string,
    @Query('content') content: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    let didSucceed = await this.emailService.sendRawEmail(
      this.BC_EMAIL_ADDRESS,
      to,
      subject,
      content,
    );

    // "Accidentally" forgot this here while coding... Oops.
    // A server side prototype pollution can be found in the `name` param
    // You can create a fake `status` variable and return a tempered response
    const formattedUrlWithName = `?name=${name}`;
    splitUriIntoParamsPPVulnerable(formattedUrlWithName);

    let responseJson = {
      status: HttpStatus.OK,
      message: '',
    };

    if (didSucceed) {
      res.status(HttpStatus.OK);
      responseJson.message = `{'status': ${responseJson.status}, 'message': 'Email sent to "${name} <${to}>" successfully'}`;
    } else {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR);
      responseJson.message = `{'status': ${responseJson.status}, 'message': 'Failed sending mail'}`;
    }

    return JSON.parse(responseJson.toString());
  }

  @Get('/getEmails')
  @ApiOperation({
    description: SWAGGER_DESC_GET_EMAILS,
  })
  async getEmails() {
    return await this.emailService.getEmails();
  }

  @Delete('/deleteEmails')
  @ApiOperation({
    description: SWAGGER_DESC_DELTE_EMAILS,
  })
  async deleteEmails() {
    return await this.emailService.deleteEmails();
  }
}
