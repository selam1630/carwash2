import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type Bucket = {
  count: number;
  resetAt: number;
};

@Injectable()
export class SimpleThrottleGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request) return true;

    const nodeEnv = this.configService.get<string>('app.nodeEnv') ?? 'development';
    const role = String(request.user?.role || 'GUEST').toUpperCase();
    const path = request.route?.path || request.path || 'unknown';
    const { limit, ttlMs } = this.resolvePolicy(path, role, nodeEnv);

    const ip = request.ip || request.headers['x-forwarded-for'] || 'unknown';
    const phone = request.body?.phone ? String(request.body.phone) : '';
    const userId = request.user?.id ? String(request.user.id) : '';
    const identity = userId || phone || 'anon';
    const key = `${ip}:${identity}:${role}:${path}`;

    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || now >= current.resetAt) {
      this.buckets.set(key, {
        count: 1,
        resetAt: now + ttlMs,
      });
      this.cleanup(now);
      return true;
    }

    if (current.count >= limit) {
      throw new HttpException(
        'Too many requests. Please try again shortly.',
        429,
      );
    }

    current.count += 1;
    return true;
  }

  private cleanup(now: number) {
    // Keep memory bounded by removing expired entries opportunistically.
    if (this.buckets.size < 5_000) return;
    for (const [key, bucket] of this.buckets.entries()) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }

  private resolvePolicy(path: string, role: string, nodeEnv: string) {
    const isProd = nodeEnv === 'production';
    const authPath = path.startsWith('/auth') ? path : '';

    if (authPath.includes('/auth/send-otp')) {
      return { limit: isProd ? 5 : 12, ttlMs: 10 * 60_000 };
    }
    if (authPath.includes('/auth/verify-otp')) {
      return { limit: isProd ? 8 : 20, ttlMs: 10 * 60_000 };
    }
    if (authPath.includes('/auth/refresh')) {
      return { limit: isProd ? 20 : 60, ttlMs: 5 * 60_000 };
    }

    if (role === 'ADMIN') {
      return { limit: isProd ? 240 : 600, ttlMs: 60_000 };
    }
    if (role === 'WASHER' || role === 'SALES') {
      return { limit: isProd ? 160 : 420, ttlMs: 60_000 };
    }
    return { limit: isProd ? 120 : 300, ttlMs: isProd ? 60_000 : 30_000 };
  }
}
