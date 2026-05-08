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

    this.logger.error(
      'Unhandled exception',
      exception instanceof Error ? exception.stack : undefined
    );

    const genericResponse = { error: 'An internal error has occurred' };
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : 500;

    if (gql) {
      throw new InternalServerErrorException(genericResponse);
    }

    return applicationRef.reply(host.getArgByIndex(1), genericResponse, status);
  }
}
