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
import { basename } from 'path';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private sanitizeErrorForLogging(exception: unknown) {
    const statusCode =
      typeof (exception as { statusCode?: unknown })?.statusCode === 'number'
        ? ((exception as { statusCode?: number }).statusCode as number)
        : undefined;
    const code =
      typeof (exception as { code?: unknown })?.code === 'string'
        ? ((exception as { code?: string }).code as string)
        : undefined;
    const name =
      typeof (exception as { name?: unknown })?.name === 'string'
        ? ((exception as { name?: string }).name as string)
        : 'Error';
    const message =
      typeof (exception as { message?: unknown })?.message === 'string'
        ? ((exception as { message?: string }).message as string)
        : 'Unexpected failure';

    return {
      name: basename(name),
      code,
      statusCode,
      message: message.replace(/([A-Za-z]:\\[^\s]+|\/[^\s]*)/g, '[redacted-path]')
    };
  }

  private getResponseBody(status: number) {
    return {
      statusCode: status,
      ...this.getSanitizedResponse(status)
    };
  }

  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';

    if (exception instanceof HttpException) {
      const status = this.getSafeStatus(exception);
      this.logger.warn(
        JSON.stringify({
          event: 'HTTP exception intercepted',
          status,
          err: this.sanitizeErrorForLogging(exception)
        })
      );

      const sanitizedException = new HttpException(
        this.getResponseBody(status),
        status
      );

      if (gql) {
        throw sanitizedException;
      }

      return super.catch(sanitizedException, host);
    }

    this.logger.error(
      JSON.stringify({
        event: 'Unhandled exception intercepted',
        err: this.sanitizeErrorForLogging(exception)
      })
    );

    const unprocessableException = new InternalServerErrorException({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
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
