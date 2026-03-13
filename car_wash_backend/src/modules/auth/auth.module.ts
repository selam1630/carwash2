import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PassportModule } from '@nestjs/passport';
import { User } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entities';
import { SmsService } from './sms.service';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { OwnerProfile } from '../users/entities/owner-profile.entity';
import { SalesProfile } from '../users/entities/sales-profile.entity';
import { SalesCommission } from '../users/entities/sales-commission.entity';
import { WasherProfile } from '../users/entities/washer-profile.entity';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SecurityAuditEvent } from './entities/security-audit-event.entity';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      OwnerProfile,
      SalesProfile,
      SalesCommission,
      WasherProfile,
      SecurityAuditEvent,
    ]),
    RedisModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'single',
        options: {
          host: config.get<string>('redis.host') ?? 'localhost',
          port: config.get<number>('redis.port') ?? 6379,
          password: config.get<string>('redis.password') || undefined,
          maxRetriesPerRequest: 3,
          retryStrategy: (times: number) =>
            times <= 3 ? Math.min(times * 500, 2000) : null,
        },
      }),
      inject: [ConfigService],
    }),
    JwtModule.registerAsync({
      useFactory: (config: ConfigService) => ({
        secret: config.get('jwt.accessSecret'),
        signOptions: { expiresIn: config.get('jwt.accessExpires') },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, SmsService, JwtStrategy],
  exports: [AuthService, SmsService],
})
export class AuthModule {}
