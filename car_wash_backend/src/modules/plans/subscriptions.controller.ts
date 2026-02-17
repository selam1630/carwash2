import { Controller, Post, UseGuards, Req, Param, Get, Delete } from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private plansService: PlansService) {}

  @Post('subscribe/:planId')
  @UseGuards(JwtAuthGuard)
  subscribe(@Req() req: { user: any }, @Param('planId') planId: string) {
    return this.plansService.subscribe(req.user.sub, planId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: any }) {
    return this.plansService.getOwnerSubscription(req.user.sub);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Req() req: { user: any }) {
    return this.plansService.getOwnerSubscriptionStatus(req.user.sub);
  }

  @Delete('cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() req: { user: any }) {
    return this.plansService.cancelSubscription(req.user.sub);
  }
}
