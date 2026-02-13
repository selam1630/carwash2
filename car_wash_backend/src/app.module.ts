import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import configuration from './config/configuration';
import schema from './config/schema';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './modules/users/entities/user.entity';
import { RefreshToken } from './modules/auth/entities/refresh-token.entities';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OwnerProfile } from './modules/users/entities/owner-profile.entity';
import { WasherProfile } from './modules/users/entities/washer-profile.entity';
import { SalesProfile } from './modules/users/entities/sales-profile.entity';
import { SalesCommission } from './modules/users/entities/sales-commission.entity';
import { Plan } from './modules/plans/entities/plan.entity';
import { OwnerSubscription } from './modules/plans/entities/owner-subscription.entity';
import { PlansModule } from './modules/plans/plans.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: schema,
      validationOptions: {
        abortEarly: true,
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.username'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: [
          User,
          RefreshToken,
          OwnerProfile,
          WasherProfile,
          SalesProfile,
          SalesCommission,
          Plan,
          OwnerSubscription,
        ],
        synchronize: true,
      }),
      inject: [ConfigService],
    }),
    AuthModule,
    UsersModule,
    PlansModule,
  ],
})
export class AppModule {}
