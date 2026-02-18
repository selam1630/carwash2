import { Controller, Post, UseGuards, Req, Param, Get, Delete } from '@nestjs/common';
import { PlansService } from './plans.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private plansService: PlansService) {}

  private userId(req: { user: any }): string {
    return req.user?.id ?? req.user?.sub;
  }

  @Post('subscribe/:planId')
  @UseGuards(JwtAuthGuard)
  subscribe(@Req() req: { user: any }, @Param('planId') planId: string) {
    return this.plansService.subscribe(this.userId(req), planId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: { user: any }) {
    return this.plansService.getOwnerSubscription(this.userId(req));
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@Req() req: { user: any }) {
    return this.plansService.getOwnerSubscriptionStatus(this.userId(req));
  }

  @Delete('cancel')
  @UseGuards(JwtAuthGuard)
  cancel(@Req() req: { user: any }) {
    return this.plansService.cancelSubscription(this.userId(req));
  }
}
