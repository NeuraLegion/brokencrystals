import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';
    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    this.logger.error('Unhandled exception',
      exception instanceof Error ? exception.stack : undefined
    );

    const genericResponse = { error: 'An internal error has occurred' };

    if (exception instanceof HttpException) {
      if (gql) {
        throw new InternalServerErrorException(genericResponse);
      }

      return applicationRef.reply(
        host.getArgByIndex(1),
        genericResponse,
        exception.getStatus()
      );
    }

    const unprocessableException = new InternalServerErrorException(genericResponse);

    if (gql) {
      throw unprocessableException;
    }

    return applicationRef.reply(
      host.getArgByIndex(1),
      unprocessableException.getResponse(),
      unprocessableException.getStatus()
    );
  }
}
