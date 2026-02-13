import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { OwnerSubscription } from './entities/owner-subscription.entity';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Plan, OwnerSubscription]),
  ],
  controllers: [PlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
