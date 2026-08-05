import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { GqlContextType } from '@nestjs/graphql';

@Catch()
export class GlobalExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  private sanitizeHttpException(exception: HttpException): HttpException {
    const status = exception.getStatus();

    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return new BadRequestException({ error: 'Bad request' });
      case HttpStatus.UNAUTHORIZED:
        return new UnauthorizedException({ error: 'Unauthorized' });
      case HttpStatus.FORBIDDEN:
        return new ForbiddenException({ error: 'Forbidden' });
      case HttpStatus.NOT_FOUND:
        return new NotFoundException({ error: 'Not found' });
      default:
        if (status >= 500) {
          return new InternalServerErrorException({ error: 'Internal server error' });
        }

        return new HttpException({ error: 'Request failed' }, status);
    }
  }

  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';

    if (exception instanceof HttpException) {
      this.logger.warn(
        exception instanceof Error ? exception.message : 'HTTP exception'
      );

      const response = this.sanitizeHttpException(exception);
      if (gql) {
        throw response;
      }

      const applicationRef =
        this.applicationRef ||
        (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

      return applicationRef.reply(
        host.getArgByIndex(1),
        response.getResponse(),
        response.getStatus()
      );
    }

    this.logger.error(
      exception instanceof Error ? exception.message : 'Unhandled exception',
      exception instanceof Error ? exception.stack : undefined
    );

    const unprocessableException = new InternalServerErrorException(
      { error: 'Internal server error' },
      'An internal error has occurred, and the API was unable to service your request.'
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
}
