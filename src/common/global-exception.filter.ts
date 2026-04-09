import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
  Logger
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        exceptionResponse &&
        typeof exceptionResponse === 'object' &&
        'error' in exceptionResponse &&
        typeof (exceptionResponse as { error?: unknown }).error === 'string'
      ) {
        message = (exceptionResponse as { error: string }).error;
      } else if (
        exceptionResponse &&
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        const rawMessage = (exceptionResponse as { message?: unknown }).message;
        if (typeof rawMessage === 'string') {
          message = rawMessage;
        } else if (Array.isArray(rawMessage) && rawMessage.length > 0) {
          message = typeof rawMessage[0] === 'string' ? rawMessage[0] : message;
        }
      }
    }

    const logMessage =
      exception instanceof Error ? exception.message : String(exception);
    this.logger.error(`${request.method} ${request.url} failed: ${logMessage}`,
      exception instanceof Error ? exception.stack : undefined);

    response.status(status).send({
      statusCode: status,
      error: status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal Server Error' : 'Error',
      message: status === HttpStatus.INTERNAL_SERVER_ERROR ? 'Internal server error' : message
    });
  }
}
