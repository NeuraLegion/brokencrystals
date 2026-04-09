import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger
} from '@nestjs/common';
import { BaseExceptionFilter, HttpAdapterHost } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';
import type { FastifyReply } from 'fastify';

@Catch()
export class GlobalExceptionFilter
  extends BaseExceptionFilter
  implements ExceptionFilter
{
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly httpAdapterHost: HttpAdapterHost) {
    super(httpAdapterHost.httpAdapter);
  }

  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';

    if (exception instanceof HttpException) {
      if (gql) {
        throw exception;
      }

      return super.catch(exception, host);
    }

    this.logUnexpectedException(exception);

    const sanitizedException = new InternalServerErrorException(
      { error: 'An internal error has occurred.' },
      'An internal error has occurred, and the API was unable to service your request.'
    );

    if (gql) {
      throw sanitizedException;
    }

    const reply = host.switchToHttp().getResponse<FastifyReply>();
    const response = sanitizedException.getResponse();

    return reply.status(sanitizedException.getStatus()).send(response);
  }

  private logUnexpectedException(exception: unknown): void {
    if (exception instanceof Error) {
      this.logger.error(exception.name, exception.stack);
      return;
    }

    try {
      this.logger.error('Unhandled exception', JSON.stringify(exception));
    } catch {
      this.logger.error('Unhandled exception');
    }
  }
}
