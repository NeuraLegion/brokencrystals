import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { FastifyReply, FastifyRequest } from 'fastify';

@Injectable()
export class AnyFilesInterceptor implements NestInterceptor {
  public async intercept(
    context: ExecutionContext,
    next: CallHandler<any>,
  ): Promise<Observable<any>> {
    const req = context.switchToHttp().getRequest() as FastifyRequest;
    const res = context.switchToHttp().getResponse() as FastifyReply;

    if (!req.isMultipart()) {
      res.send(
        new BadRequestException({
          error: 'Request is not multipart',
          location: __filename,
        }),
      );
      return;
    }

    return next.handle();
  }
}
