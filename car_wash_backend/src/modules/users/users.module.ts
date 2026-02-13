import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { OwnerProfile } from './entities/owner-profile.entity';
import { WasherProfile } from './entities/washer-profile.entity';
import { SalesProfile } from './entities/sales-profile.entity';
import { SalesCommission } from './entities/sales-commission.entity';
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      OwnerProfile,
      WasherProfile,
      SalesProfile,
      SalesCommission,
    ]),
    MulterModule.register({ dest: './uploads' }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
