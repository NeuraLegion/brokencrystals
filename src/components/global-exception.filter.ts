import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost) {
    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    if (exception instanceof HttpException) {
      return super.catch(exception, host);
    }

    const unprocessableException = new InternalServerErrorException(
      { error: (exception as Error).message, location: __filename },
      'An internal error has occurred, and the API was unable to service your request.',
    );

    return applicationRef.reply(
      host.getArgByIndex(1),
      unprocessableException.getResponse(),
      unprocessableException.getStatus(),
    );
  }
}
