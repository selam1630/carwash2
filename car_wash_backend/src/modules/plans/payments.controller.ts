import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
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
  @Get('complete')
  async complete(@Req() req: any, @Query('tx_ref') txRef: string, @Query('planId') planId: string) {
    const query = req?.query || {};
    const normalizedTxRef = this.normalizeQueryValue(txRef || query['amp;tx_ref']);
    const normalizedPlanId = this.normalizeQueryValue(planId || query['amp;planId']);

    return {
      success: true,
      message: 'Payment callback received. Call GET /payments/verify with JWT to finalize subscription.',
      tx_ref: normalizedTxRef,
      planId: normalizedPlanId,
    };
  }

  // frontend calls this after user completes payment and is redirected back
  @UseGuards(JwtAuthGuard)
  @Get('verify')
  async verify(@Req() req: any, @Query('tx_ref') txRef: string, @Query('planId') planId: string) {
    const query = req?.query || {};
    const normalizedTxRef = this.normalizeQueryValue(txRef || query['amp;tx_ref']);
    const normalizedPlanId = this.normalizeQueryValue(planId || query['amp;planId']);

    if (!normalizedTxRef || !normalizedPlanId) {
      throw new BadRequestException('tx_ref and planId are required');
    }

    const user = req.user;
    return this.payments.verifyPayment(user, normalizedTxRef, normalizedPlanId);
  }

  private normalizeQueryValue(value: unknown): string {
    if (!value) return '';
    const decoded = String(value)
      .replace(/&amp;/g, '&')
      .trim();

    // Handles cases like tx_ref=sub_xxx&amp;planId=...
    const beforeAmp = decoded.split('&')[0];
    return decodeURIComponent(beforeAmp);
  }
}
