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
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    if (exception instanceof HttpException) {
      return super.catch(exception, host);
    }

    const unprocessableException = new InternalServerErrorException(
      { error: (exception as Error).message, location: __filename },
      'An internal error has occurred, and the API was unable to service your request.',
    );

    return response
      .status(unprocessableException.getStatus())
      .send(unprocessableException.getResponse());
  }
}
