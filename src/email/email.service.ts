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

  private readonly MAIL_CATCHER_MESSAGES_URL = 'http://localhost:1080/messages';

  async sendRawEmail(
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

    let mailOptions = {
      envelope: {
        from: from,
        to: to,
      },
      raw: `From: sender@example.com
To: recipient@example.com
Subject: test message

Hello world!`,
    };

    this.transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        return console.log(error);
      }
      console.log('Message sent: ' + info.response);
    });

    return Boolean(true);
  }

  async getEmails(): Promise<JSON> {
    this.logger.debug(`Fetching all emails from MailCatcher`);

    return await fetch(this.MAIL_CATCHER_MESSAGES_URL).then((response) =>
      response.ok ? response.json() : 'Failed to get emails',
    );
  }

  async deleteEmails(): Promise<Boolean> {
    this.logger.debug(`Deleting all emails from MailCatcher`);

    return await fetch(this.MAIL_CATCHER_MESSAGES_URL, {
      method: 'DELETE',
    }).then((response) => response.ok);
  }
}
