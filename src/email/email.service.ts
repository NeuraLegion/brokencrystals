const axios = require('axios');

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { json } from 'sequelize';
const nodemailer = require('nodemailer');

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private readonly smtpServerDetails = {
    host: 'mailcatcher',
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

  private readonly MAIL_CATCHER_MESSAGES_URL =
    'http://mailcatcher:1080/messages';

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

    // TODO: Need to add support for CC, BCC
    let mailOptions = {
      envelope: {
        from: from,
        to: to,
      },
      raw: `From: ${from}
To: ${to}
Subject: ${subject}

${body}`,
    };

    return await this.transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        this.logger.debug(`Error sending mail: ${error}`);
        return false;
      }
      return true;
    });
  }

  async getEmails(): Promise<json> {
    this.logger.debug(`Fetching all emails from MailCatcher`);

    return await axios
      .get(this.MAIL_CATCHER_MESSAGES_URL)
      .then((res) =>
        res.status == HttpStatus.OK
          ? res.data
          : { error: 'Failed to get emails' },
      );
  }

  async deleteEmails(): Promise<Boolean> {
    this.logger.debug(`Deleting all emails from MailCatcher`);

    return await axios
      .get(this.MAIL_CATCHER_MESSAGES_URL, {
        method: 'DELETE',
      })
      .then((res) => res.status == HttpStatus.OK);
  }
}
