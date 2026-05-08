import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';

const sanitizeErrorForLog = (exception: unknown): { name?: string; message?: string } => {
  if (!(exception instanceof Error)) {
    return {};
  }

  return {
    name: exception.name,
    message: 'Error details hidden'
  };
};

const redactSensitiveText = (value: string): string => {
  return value
    .replace(/([A-Za-z]:\\[^\s'"`<>]+)/g, '[redacted-path]')
    .replace(/((?:\/[^\s'"`<>]+)+)/g, '[redacted-path]');
};

const getGenericErrorBody = (statusCode: number): { error: string } => {
  if (statusCode === 401) {
    return { error: 'Unauthorized' };
  }

  if (statusCode === 403) {
    return { error: 'Forbidden' };
  }

  if (statusCode === 404) {
    return { error: 'Not Found' };
  }

  if (statusCode >= 400 && statusCode < 500) {
    return { error: 'Request failed' };
  }

  return { error: 'Internal Server Error' };
};

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';
    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    if (!applicationRef) {
      this.logger.error('HTTP adapter is not available for exception handling');
      return;
    }

    if (exception instanceof HttpException) {
      this.logger.warn({
        status: exception.getStatus(),
        error: sanitizeErrorForLog(exception)
      });
    } else {
      this.logger.error(
        `Unhandled exception: ${JSON.stringify(sanitizeErrorForLog(exception))}`
      );
    }

    const response = host.switchToHttp().getResponse();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const responseBody = getGenericErrorBody(status);
    const safeResponseBody =
      exception instanceof Error &&
      typeof exception.message === 'string' &&
      redactSensitiveText(exception.message) !== exception.message
        ? { ...responseBody, message: responseBody.error }
        : responseBody;

    if (gql) {
      throw new HttpException(safeResponseBody, status);
    }

    if (response?.sent || response?.raw?.writableEnded) {
      return;
    }

    applicationRef.setHeader(response, 'Content-Type', 'application/json; charset=utf-8');
    applicationRef.setHeader(response, 'X-Content-Type-Options', 'nosniff');
    applicationRef.setHeader(response, 'X-Powered-By', '');

    return applicationRef.reply(response, safeResponseBody, status);
  }
}
