import { Injectable, Logger } from '@nestjs/common';
const nodemailer = require('nodemailer');

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private readonly smtpServerDetails = {
    host: '127.0.0.1',
    port: 1025,
    secure: false,
    auth: {
      user: 'mailcatcher',
      pass: 'mailcatcher',
    },
  };

  private readonly transporter = nodemailer.createTransport(
    this.smtpServerDetails,
  );

  async sendMail(
    from: string,
    to: string,
    subject: string,
    body: string,
  ): Promise<boolean> {
    this.logger.debug(`Sending mail from "${from}" to "${to}"`);
    this.logger.debug(
      `Mail subject is (shortened): "${subject.substring(0, 16)}"`,
    );
    this.logger.debug(`Mail body is (shortened): "${body.substring(0, 16)}"`);

    let result = await this.transporter.sendMail({
      from: from,
      to: to,
      subject: subject,
      html: body,
    });

    return Boolean(result);
  }
}
