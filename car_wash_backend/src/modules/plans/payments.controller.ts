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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.OWNER)
  @Get('verify')
  async verify(@Req() req: any, @Query('tx_ref') txRef: string, @Query('planId') planId: string) {
    const query = req?.query || {};
    const rawTxCandidates = [
      txRef,
      query['tx_ref'],
      query['txRef'],
      query['amp;tx_ref'],
      query['amp;txRef'],
    ];
    const rawPlanCandidates = [
      planId,
      query['planId'],
      query['plan_id'],
      query['amp;planId'],
      query['amp;plan_id'],
    ];

    let normalizedTxRef = this.firstNormalized(rawTxCandidates);
    let normalizedPlanId = this.firstNormalized(rawPlanCandidates);

    if (!normalizedTxRef || !normalizedPlanId) {
      const embedded = this.extractEmbeddedParams([
        ...rawTxCandidates,
        ...rawPlanCandidates,
      ]);
      normalizedTxRef ||= embedded.txRef;
      normalizedPlanId ||= embedded.planId;
    }

    if (!normalizedTxRef || !normalizedPlanId) {
      throw new BadRequestException(
        `tx_ref and planId are required (received tx_ref='${normalizedTxRef}', planId='${normalizedPlanId}')`,
      );
    }

    const user = req.user;
    return this.payments.verifyPayment(user, normalizedTxRef, normalizedPlanId);
  }

  private normalizeQueryValue(value: unknown): string {
    if (!value) return '';
    if (Array.isArray(value)) {
      return this.normalizeQueryValue(value[0]);
    }
    const decoded = String(value)
      .replace(/&amp;/g, '&')
      .trim();

    // Handles cases like tx_ref=sub_xxx&amp;planId=...
    const beforeAmp = decoded.split('&')[0];
    return decodeURIComponent(beforeAmp);
  }

  private firstNormalized(values: unknown[]): string {
    for (const value of values) {
      const normalized = this.normalizeQueryValue(value);
      if (normalized) return normalized;
    }
    return '';
  }

  private extractEmbeddedParams(values: unknown[]): { txRef: string; planId: string } {
    let txRef = '';
    let planId = '';

    for (const value of values) {
      if (!value) continue;
      const text = String(Array.isArray(value) ? value[0] : value)
        .replace(/&amp;/g, '&')
        .trim();
      if (!text) continue;

      const txMatch = text.match(/(?:^|[?&])(tx_ref|txRef)=([^&#]+)/);
      if (!txRef && txMatch?.[2]) {
        txRef = decodeURIComponent(txMatch[2]).trim();
      }

      const planMatch = text.match(/(?:^|[?&])(planId|plan_id)=([^&#]+)/);
      if (!planId && planMatch?.[2]) {
        planId = decodeURIComponent(planMatch[2]).trim();
      }

      if (txRef && planId) break;
    }

    return { txRef, planId };
  }
}
