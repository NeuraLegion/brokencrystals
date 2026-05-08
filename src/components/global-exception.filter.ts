import {
  ArgumentsHost,
  Catch,
  HttpException,
  InternalServerErrorException,
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
    message: exception.message
  };
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

  return { error: 'An internal error has occurred' };
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
      throw new InternalServerErrorException({
        error: 'An internal error has occurred'
      });
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

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const responseBody = getGenericErrorBody(status);

    if (gql) {
      throw new HttpException(responseBody, status);
    }

    const response = host.switchToHttp().getResponse();
    return applicationRef.reply(response, responseBody, status);
  }
}
