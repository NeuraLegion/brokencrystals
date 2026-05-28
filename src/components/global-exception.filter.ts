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

      return super.catch(exception, host);
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
