import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { JwtPayload } from '../types/jwt-payload.type';

interface JwtSignPayload {
  sub: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: (
        _request: unknown,
        _rawJwtToken: string,
        done: (err: Error | null, secret?: string) => void,
      ) => {
        const secret = this.configService.get<string>('jwt.accessSecret');
        done(null, secret ?? '');
      },
    });
  }

  validate(payload: JwtSignPayload): JwtPayload {
    if (!payload?.sub || !payload?.role) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return { id: payload.sub, role: payload.role as JwtPayload['role'] };
  }
}
