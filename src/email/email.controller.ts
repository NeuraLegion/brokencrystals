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
    await this.splitUriIntoParamsPPVulnerable(formattedUrlWithName);

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

  async splitUriIntoParamsPPVulnerable(params, coerce=null) {
    if (params.charAt(0) === '?') {
      params = params.substring(1);
    }

    var obj = {},
      coerce_types = { true: !0, false: !1, null: null };

    if (!params) {
      return obj;
    }

    params
      .replace(/\+/g, ' ')
      .split('&')
      .forEach(function (v) {
        var param = v.split('='),
          key = decodeURIComponent(param[0]),
          val,
          cur = obj,
          i = 0,
          keys = key.split(']['),
          keys_last = keys.length - 1;

        if (/\[/.test(keys[0]) && /\]$/.test(keys[keys_last])) {
          keys[keys_last] = keys[keys_last].replace(/\]$/, '');
          keys = keys.shift().split('[').concat(keys);
          keys_last = keys.length - 1;
        } else {
          keys_last = 0;
        }

        if (param.length === 2) {
          val = decodeURIComponent(param[1]);

          if (coerce) {
            val =
              val && !isNaN(val) && +val + '' === val
                ? +val // number
                : val === 'undefined'
                ? undefined // undefined
                : coerce_types[val] !== undefined
                ? coerce_types[val] // true, false, null
                : val; // string
          }

          if (keys_last) {
            for (; i <= keys_last; i++) {
              //@ts-ignore
              key = keys[i] === '' ? cur.length : keys[i];
              cur = cur[key] =
                i < keys_last
                  ? //@ts-ignore
                    cur[key] || (keys[i + 1] && isNaN(keys[i + 1]) ? {} : [])
                  : val;
            }
          } else {
            if (Object.prototype.toString.call(obj[key]) === '[object Array]') {
              obj[key].push(val);
            } else if ({}.hasOwnProperty.call(obj, key)) {
              obj[key] = [obj[key], val];
            } else {
              obj[key] = val;
            }
          }
        } else if (key) {
          obj[key] = coerce ? undefined : '';
        }
      });

    return obj;
  }
}