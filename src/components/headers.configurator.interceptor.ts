import {
  CallHandler,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyReply, FastifyRequest } from 'fastify';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';

@Injectable()
export class HeadersConfiguratorInterceptor implements NestInterceptor {
  public static readonly XSS_PROTECTION_HEADER: string = 'x-xss-protection';
  public static readonly STRICT_TRANSPORT_SECURITY_HEADER: string =
    'strict-transport-security';
  public static readonly CONTENT_TYPE_OPTIONS: string =
    'x-content-type-options';
  public static readonly CONTENT_SECURITY_POLICY: string =
    'content-security-policy';
  //query param backdoor to bypass security headers setting
  public static readonly NO_SEC_HEADERS_QUERY_PARAM: string = 'no-sec-headers';
  //counter cookie name
  public static readonly COUNTER_COOKIE_NAME = 'bc-calls-counter';
  private readonly logger = new Logger(HeadersConfiguratorInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = this.getRequest(context);

    const cookies: string[] = req.headers.cookie
      ? req.headers.cookie.split('; ')
      : [];

    if (cookies && cookies.length > 0) {
      const cookie = cookies
        .reverse()
        .find((str) =>
          str.startsWith(HeadersConfiguratorInterceptor.COUNTER_COOKIE_NAME),
        );

      this.logger.log(`Cookie header: ${cookie}`);

      if (cookie) {
        const counter = cookie.split('=');

        if (isNaN(+counter[1])) {
          throw new Error('Invalid counter value');
        }
      }
    }

    return next.handle().pipe(
      tap(() => {
        const res = this.getResponse(context);
        res.setCookie('bc-calls-counter', Date.now().toString(), {
          secure: false,
        });
        if (
          !req.query[HeadersConfiguratorInterceptor.NO_SEC_HEADERS_QUERY_PARAM]
        ) {
          res.header(HeadersConfiguratorInterceptor.XSS_PROTECTION_HEADER, '0');
          res.header(
            HeadersConfiguratorInterceptor.STRICT_TRANSPORT_SECURITY_HEADER,
            'max-age=0',
          );
          res.header(HeadersConfiguratorInterceptor.CONTENT_TYPE_OPTIONS, '1');
          res.header(
            HeadersConfiguratorInterceptor.CONTENT_SECURITY_POLICY,
            `default-src  * 'unsafe-inline' 'unsafe-eval'`,
          );
        }
      }),
    );
  }

  private getRequest(context: ExecutionContext): FastifyRequest {
    return context.getType<GqlContextType>() === 'graphql'
      ? GqlExecutionContext.create(context).getContext().req
      : context.switchToHttp().getRequest();
  }

  private getResponse(context: ExecutionContext): FastifyReply {
    return context.getType<GqlContextType>() === 'graphql'
      ? GqlExecutionContext.create(context).getContext().reply
      : context.switchToHttp().getResponse();
  }
}
