import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';

    if (exception instanceof HttpException) {
      if (exception.getStatus() < 500) {
        if (gql) {
          throw exception;
        }

        return super.catch(exception, host);
      }

      exception = new InternalServerErrorException(
        { error: 'An internal error has occurred.' },
        'An internal error has occurred, and the API was unable to service your request.'
      );
    }

    const unprocessableException = new InternalServerErrorException(
      { error: 'An internal error has occurred.' },
      'An internal error has occurred, and the API was unable to service your request.'
    );

    const sanitizedException =
      exception instanceof InternalServerErrorException
        ? exception
        : unprocessableException;

    if (gql) {
      throw sanitizedException;
    }

    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    return applicationRef.reply(
      host.getArgByIndex(1),
      sanitizedException.getResponse(),
      sanitizedException.getStatus()
    );
  }
}
