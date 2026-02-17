import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { RedisModule } from '@nestjs-modules/ioredis';
import { WashRequest } from './entities/wash-request.entity';
import { User } from '../users/entities/user.entity';
import { OwnerSubscription } from '../plans/entities/owner-subscription.entity';
import { WashController } from './wash.controller';
import { WashService } from './wash.service';
import { WashGateway } from './wash.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([WashRequest, User, OwnerSubscription]),
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
        secret: config.get<string>('jwt.accessSecret'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [WashController],
  providers: [WashService, WashGateway],
  exports: [WashService],
})
export class WashModule {}
