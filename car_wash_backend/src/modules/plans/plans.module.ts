import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { OwnerSubscription } from './entities/owner-subscription.entity';
import { OwnerProfile } from '../users/entities/owner-profile.entity';
import { PlansController } from './plans.controller';
import { AuthModule } from '../auth/auth.module';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsNotifier } from './subscriptions.notifier';
import { PlansService } from './plans.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, OwnerSubscription, OwnerProfile]),
    AuthModule,
  ],
  controllers: [PlansController, SubscriptionsController, PaymentsController],
  providers: [PlansService, SubscriptionsNotifier, PaymentsService],
  exports: [PlansService],
})
export class PlansModule {}
