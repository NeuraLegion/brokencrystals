import {
  Controller,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
} from '@nestjs/swagger';
import {EmailService} from './email.service'

@Controller('/api/email')
@ApiTags('Email controller')
export class EmailController {
  private readonly logger = new Logger(EmailController.name);

  constructor(private emailService: EmailService) {}
}
