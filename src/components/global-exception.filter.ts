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

    const genericResponse = { error: 'An internal error has occurred' };
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const responseBody =
      status === 401
        ? { error: 'Unauthorized' }
        : status === 403
          ? { error: 'Forbidden' }
          : status === 404
            ? { error: 'Not Found' }
            : status >= 400 && status < 500
              ? { error: 'Request failed' }
              : genericResponse;

    if (gql) {
      if (status === 401) {
        throw new HttpException({ error: 'Unauthorized' }, 401);
      }
      throw new InternalServerErrorException(genericResponse);
    }

    const response = host.switchToHttp().getResponse();
    return applicationRef.reply(response, responseBody, status);
  }
}
