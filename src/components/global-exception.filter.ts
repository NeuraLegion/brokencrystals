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

const GENERIC_HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found'
};

type ErrorResponseBody = {
  statusCode: number;
  error: string;
  message?: string;
};

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private sanitizeText(value: string) {
    return value
      .replace(/([A-Za-z]:\\[^\r\n\t"' )\]}]+|(?:\/[^\r\n\t"' )\]}]+)+)/g, '[redacted-path]')
      .replace(/file:\/\/[^\r\n\t"' )\]}]+/gi, '[redacted-file-uri]')
      .replace(/\b(?:[A-Za-z]:)?(?:\\|\/)(?:[^\r\n\t"' )\]}]+(?:\\|\/))*[^\r\n\t"' )\]}]*/g, '[redacted-path]');
  }

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

    return {
      name: this.sanitizeText(name),
      code,
      statusCode,
      message: 'Unexpected failure'
    };
  }

  private getResponseBody(status: number) {
    return {
      statusCode: status,
      error:
        status >= 500
          ? 'Internal Server Error'
          : (GENERIC_HTTP_ERROR_MESSAGES[status] ?? 'Request failed')
    };
  }

  private getSanitizedHttpExceptionBody(
    exception: HttpException,
    status: number
  ): ErrorResponseBody {
    const genericBody = this.getResponseBody(status);
    const response = exception.getResponse();

    if (!response || typeof response !== 'object' || Array.isArray(response)) {
      return genericBody;
    }

    const responseBody = response as Record<string, unknown>;

    return {
      ...genericBody,
      ...(typeof responseBody.message === 'string'
        ? { message: this.sanitizeText(responseBody.message) }
        : {})
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
        this.getSanitizedHttpExceptionBody(exception, status),
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

    const unprocessableException = new InternalServerErrorException(
      this.getResponseBody(HttpStatus.INTERNAL_SERVER_ERROR)
    );

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
}
