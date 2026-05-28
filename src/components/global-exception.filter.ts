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
      if (gql) {
        throw exception;
      }

      const status = exception.getStatus();
      const sanitizedException = new InternalServerErrorException(
        status >= 500
          ? 'An internal error has occurred'
          : 'Unauthorized'
      );

      return super.catch(sanitizedException, host);
    }

    const unprocessableException = new InternalServerErrorException(
      'An internal error has occurred, and the API was unable to service your request.'
    );

    if (gql) {
      throw unprocessableException;
    }

    return super.catch(unprocessableException, host);
  }
}
