import { Controller, Post, UseGuards, Req, Param, Get, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('initialize/:planId')
  async initialize(@Req() req: any, @Param('planId') planId: string) {
    const user = req.user;
    return this.payments.initializePayment(user, planId);
  }

  // frontend calls this after user completes payment and is redirected back
  @UseGuards(JwtAuthGuard)
  @Get('verify')
  async verify(@Req() req: any, @Query('tx_ref') txRef: string, @Query('planId') planId: string) {
    const user = req.user;
    return this.payments.verifyPayment(user, txRef, planId);
  }
}
