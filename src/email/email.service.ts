const axios = require('axios');

import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { forEach } from 'lodash';
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
      `Mail subject is (trimmed): "${subject.substring(0, 64)}"`,
    );
    this.logger.debug(`Mail body is (trimmed): "${body.substring(0, 64)}"`);

    const mailOptions = this.createMailOptionsForEmailInjetion(
      from,
      to,
      subject,
      body,
    );

    let response = await this.transporter.sendMail(mailOptions);

    if (response.err) {
      this.logger.debug(`Failed sending email. Error: ${response.err}`);
      return false;
    }

    this.logger.debug(`Email sent successfully!`);
    return true;
  }

  private createMailOptionsForEmailInjetion(
    from: string,
    to: string,
    subject: string,
    body: string,
  ) {
    to = to.replace('\n', '%0A');
    this.logger.debug(`Creating vulnerable mailOptions. "to" param is: ${to}`);

    let parsedSubject: any = subject;
    let parsedFrom: any = from;
    let parsedTo: any = to;
    let parsedCc: any = [];
    let parsedBcc: any = [];

    // This is intentional to support email injection
    if (
      to.toLowerCase().includes('%0a') ||
      to.toLowerCase().includes('%0d%0a')
    ) {
      parsedSubject = /Subject:(.+?)(?=%0A)/i.exec(to);
      parsedSubject = parsedSubject ? parsedSubject[1] : subject;

      parsedFrom = /From:(.+?)(?=%0A)/i.exec(to);
      parsedFrom = parsedFrom ? parsedFrom[1] : from;

      parsedTo = /(.+?)(?=%0A)/i.exec(to);
      parsedTo = parsedTo ? parsedTo[1] : to;

      parsedCc = /Cc:(.+?)(?=%0A)/i.exec(to) || /Cc:(.*)/i.exec(to);
      parsedCc = parsedCc ? parsedCc[1] : null;

      parsedBcc = /Bcc:(.+?)(?=%0A)/i.exec(to) || /Bcc:(.*)/i.exec(to);
      parsedBcc = parsedBcc ? parsedBcc[1] : null;
    }

    this.logger.debug(
      `parsedFrom: ${parsedFrom} | parsedTo: ${parsedTo} | parsedCc: ${parsedCc} | parsedBcc: ${parsedBcc}`,
    );

    // Build final raw email
    let rawContent = '';
    if (parsedSubject) {
      rawContent += `Subject: ${parsedSubject}\n`;
    }
    if (parsedFrom) {
      rawContent += `From: ${parsedFrom}\n`;
    }
    if (parsedTo) {
      rawContent += `To: ${parsedTo}\n`;
    }
    if (parsedCc) {
      rawContent += `Cc: ${parsedCc}\n`;
    }
    if (parsedBcc) {
      rawContent += `Bcc: ${parsedBcc}\n`;
    }

    rawContent += `\n${body}\n`;

    let mailOptions = {
      envelope: {
        from: parsedFrom,
        to: parsedTo,
        cc: parsedCc ? [parsedCc] : [],
        bcc: parsedCc ? [parsedCc] : [],
      },
      raw: rawContent,
    };

    return mailOptions;
  }

  async getEmails(withSource): Promise<json> {
    this.logger.debug(`Fetching all emails from MailCatcher`);

    let emails = await axios
      .get(this.MAIL_CATCHER_MESSAGES_URL)
      .then((res) =>
        res.status == HttpStatus.OK
          ? res.data
          : { error: 'Failed to get emails' },
      );

    if (withSource) {
      this.logger.debug(`Fetching sources of Emails`);
      for (let email of emails) {
        email['source'] = await this.getEmailSource(email['id']);
      }
    }

    return emails;
  }

  private async getEmailSource(emailId): Promise<string> {
    let sourceUrl = `${this.MAIL_CATCHER_MESSAGES_URL}/${emailId}.source`;

    return await axios
      .get(sourceUrl)
      .then((res) =>
        res.status == HttpStatus.OK
          ? res.data
          : { error: 'Failed to get emails' },
      )
      .catch((err) =>
        this.logger.debug(
          `Failed to fetch email source with id ${emailId} via "${sourceUrl}". Error: ${err}`,
        ),
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
