import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
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

    if (exception instanceof HttpException) {
      const status = this.getSafeStatus(exception);
      this.logger.warn(`HTTP exception intercepted: status=${status}`);

      const sanitizedException = new HttpException(
        this.getSanitizedResponse(status),
        status
      );

      if (gql) {
        throw sanitizedException;
      }

      return super.catch(sanitizedException, host);
    }

    this.logger.error('Unhandled exception intercepted', exception as Error);

    const unprocessableException = new InternalServerErrorException({
      error: 'Internal Server Error'
    });

    if (gql) {
      throw unprocessableException;
    }

    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    return applicationRef.reply(
      host.getArgByIndex(1),
      unprocessableException.getResponse(),
      unprocessableException.getStatus()
    );
  }

  private getSafeStatus(exception: HttpException): number {
    try {
      const status = exception.getStatus();
      return Number.isInteger(status) ? status : HttpStatus.INTERNAL_SERVER_ERROR;
    } catch {
      return HttpStatus.INTERNAL_SERVER_ERROR;
    }
  }

  private getSanitizedResponse(status: number) {
    if (status >= 500) {
      return { error: 'Internal Server Error' };
    }

    if (status === 401) {
      return { error: 'Unauthorized' };
    }

    if (status === 403) {
      return { error: 'Forbidden' };
    }

    if (status === 404) {
      return { error: 'Not Found' };
    }

    if (status === 400) {
      return { error: 'Bad Request' };
    }

    return { error: 'Request failed' };
  }
}
