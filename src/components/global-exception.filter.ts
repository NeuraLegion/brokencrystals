import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ForbiddenException,
  HttpException,
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
    switch (exception.getStatus()) {
      case 400:
        return new BadRequestException({ error: 'Bad Request' });
      case 401:
        return new UnauthorizedException({ error: 'Unauthorized' });
      case 403:
        return new ForbiddenException({ error: 'Forbidden' });
      case 404:
        return new NotFoundException({ error: 'Not Found' });
      default:
        return new InternalServerErrorException(
          { error: 'An internal error has occurred.' },
          'An internal error has occurred, and the API was unable to service your request.'
        );
    }
  }

  public catch(exception: unknown, host: ArgumentsHost) {
    const gql = host.getType<GqlContextType>() === 'graphql';

    if (exception instanceof Error) {
      this.logger.error(exception.message);
    }

    const sanitizedException =
      exception instanceof HttpException
        ? this.sanitizeHttpException(exception)
        : new InternalServerErrorException(
            { error: 'An internal error has occurred.' },
            'An internal error has occurred, and the API was unable to service your request.'
          );

    if (gql) {
      throw sanitizedException;
    }

    const applicationRef =
      this.applicationRef ||
      (this.httpAdapterHost && this.httpAdapterHost.httpAdapter);

    return applicationRef.reply(
      host.getArgByIndex(1),
      sanitizedException.getResponse(),
      sanitizedException.getStatus()
    );
  }
}
