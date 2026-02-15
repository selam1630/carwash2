import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WashRequest } from './entities/wash-request.entity';
import { User } from '../users/entities/user.entity';
import { WashController } from './wash.controller';
import { WashService } from './wash.service';
import { WashGateway } from './wash.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([WashRequest, User]),
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
