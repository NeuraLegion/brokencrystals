import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class HeadersConfiguratorInterceptor implements NestInterceptor {
  public static readonly XSS_PROTECTION_HEADER: string = 'X-XSS-Protection';
  public static readonly STRICT_TRANSPORT_SECURITY_HEADER: string =
    'Strict-Transport-Security';
  public static readonly CONTENT_TYPE_OPTIONS: string =
    'X-Content-Type-Options';
  public static readonly CONTENT_SECURITY_POLICY: string =
    'Content-Security-Policy';
  //query param backdoor to bypass security headers setting
  public static readonly NO_SEC_HEADERS_QUERY_PARAM: string = 'no-sec-headers';

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest() as Request;    

    //force session cookie
    req.session['visits'] = req.session['visits']
      ? req.session['visits'] + 1
      : 1;

    return next.handle().pipe(
      tap(() => {
        if (
          !req.query[HeadersConfiguratorInterceptor.NO_SEC_HEADERS_QUERY_PARAM]
        ) {
          const res = context.switchToHttp().getResponse();
          res.header(HeadersConfiguratorInterceptor.XSS_PROTECTION_HEADER, '0');
          res.header(
            HeadersConfiguratorInterceptor.STRICT_TRANSPORT_SECURITY_HEADER,
            'max-age=0',
          );
          res.header(HeadersConfiguratorInterceptor.CONTENT_TYPE_OPTIONS, '1');
          res.header(
            HeadersConfiguratorInterceptor.CONTENT_SECURITY_POLICY,
            'default-src *;',
          );
        }
      }),
    );
  }
}
