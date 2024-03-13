import { Controller, Get, Logger, Query } from '@nestjs/common';
import {
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { EmailService } from './email.service';

@Controller('/api/email')
@ApiTags('Email controller')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private emailService: EmailService) {}

  @Get('/sendMail')
  @ApiQuery({
    name: 'to',
    example: 'username@gmail.com',
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
  @ApiHeader({ name: 'accept', example: 'image/jpg', required: true })
  @ApiOkResponse({
    description: 'File read successfully',
  })
  // @ApiInternalServerErrorResponse({
  //   schema: {
  //     type: 'object',
  //     properties: {
  //       error: { type: 'string' },
  //       location: { type: 'string' },
  //     },
  //   },
  // })

  // @ApiOperation({
  //   description: SWAGGER_DESC_READ_FILE,
  // })
  async sendMail(
    @Query('to') to: string,
    @Query('subject') subject: string,
    @Query('content') content: string,
    // @Res({ passthrough: true }) res: FastifyReply,
    // @Headers('accept') acceptHeader: string,
  ) {
    // TODO: Remove this in prod, this is a debug email
    let from = 'testMail@brokencrystals.com';
    await this.emailService.sendMail(from, to, subject, content);
  }
}
