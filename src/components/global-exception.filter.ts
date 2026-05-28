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
      if (status < 500) {
        return super.catch(exception, host);
      }

      return super.catch(
        new InternalServerErrorException('An internal error has occurred'),
        host
      );
    }

    const unprocessableException = new InternalServerErrorException(
      'An internal error has occurred'
    );

    if (gql) {
      throw unprocessableException;
    }

    return super.catch(unprocessableException, host);
  }
}
