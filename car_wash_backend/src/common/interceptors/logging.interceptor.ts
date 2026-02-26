import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const ctx = context.switchToHttp();
    const req = ctx.getRequest<Request>();
    const { method, url, ip } = req;
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const res = ctx.getResponse();
          const statusCode = res.statusCode;
          this.logger.log(
            `${method} ${url} ${statusCode} - ${Date.now() - now}ms - ${ip}`,
          );
        },
        error: (err: unknown) => {
          const statusCode =
            err && typeof err === 'object' && 'status' in err
              ? String((err as { status?: number }).status ?? '')
              : '';
          const message =
            err && typeof err === 'object' && 'message' in err
              ? String((err as { message?: string }).message ?? '')
              : '';
          this.logger.warn(
            `${method} ${url}${statusCode ? ` ${statusCode}` : ''} - ${Date.now() - now}ms - ${ip} - failed${message ? `: ${message}` : ''}`,
          );
        },
      }),
    );
  }
}
