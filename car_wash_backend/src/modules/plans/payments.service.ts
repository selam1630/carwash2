import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PlansService } from './plans.service';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly plansService: PlansService,
  ) {}

  async initializePayment(user: any, planId: string) {
    const chapaKey = this.config.get<string>('CHAPA_SECRET_KEY');
    const chapaUrl = this.config.get<string>('CHAPA_BASE_URL');

    if (!chapaKey) throw new Error('CHAPA_SECRET_KEY not configured');
    if (!chapaUrl) throw new Error('CHAPA_BASE_URL not configured');

    /* ---------------------------------- */
    /* Get Plan + Amount FIRST            */
    /* ---------------------------------- */
    const plan = await this.plansService.findOne(planId);
    if (!plan) throw new Error('Plan not found');

    const amount = Number(plan.price);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Invalid plan price for plan ${plan.id}: ${plan.price}`);
    }

    /* ---------------------------------- */
    /* Generate tx_ref (<= 50 chars)      */
    /* ---------------------------------- */
    const uid = String(user.id ?? '')
      .replace(/[^a-z0-9]/gi, '')
      .slice(0, 8);

    let txRef = `sub_${Date.now().toString(36)}_${uid}`;
    if (txRef.length > 50) txRef = txRef.slice(0, 50);

    /* ---------------------------------- */
    /* Build callback URL                 */
    /* ---------------------------------- */
    const frontendUrl =
      this.config.get<string>('FRONTEND_APP_URL') ||
      this.config.get<string>('APP_URL') ||
      'http://localhost:3000';

    const callbackUrl = `${frontendUrl}/payments/complete?tx_ref=${txRef}&planId=${encodeURIComponent(
      planId,
    )}`;
      /* ---------------------------------- */
      /* Ensure we send a valid email to Chapa */
      /* ---------------------------------- */
      const uidSafe = uid || String(user.id ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 8);

      // prefer real user email when available
      const emailFromUser = user && user.email && String(user.email).includes('@') ? String(user.email) : null;

      // otherwise try to build a safe email from phone number (digits only)
      let emailFromPhone: string | null = null;
      const phoneRaw = (user && (user.phoneNumber || user.phone || user.phone_no || user.mobile)) || '';
      const phoneDigits = String(phoneRaw).replace(/\D/g, '');
      if (phoneDigits && phoneDigits.length >= 6) {
        // use digits-only local part to avoid '+' or other chars
        emailFromPhone = `${phoneDigits}@carwash.et`;
      }

      const email = (emailFromUser || emailFromPhone || `user${uidSafe}@example.com`).toLowerCase();

    /* ---------------------------------- */
    /* Chapa Payload (Correct Format)     */
    /* ---------------------------------- */
    // validate email format
    const emailClean = String(email).trim().toLowerCase();
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean);
    const safeEmail = emailValid ? emailClean : `user${uid}@example.com`;
    if (!emailValid) {
      this.logger.warn(`Email '${email}' invalid for user ${user?.id}, falling back to ${safeEmail}`);
    }

    const payload = {
      amount,
      currency: 'ETB',
      tx_ref: txRef,
      return_url: callbackUrl,
      email: safeEmail,
      first_name: user?.firstName || 'Customer',
      last_name: user?.lastName || '',
    };

    this.logger.debug(`Chapa payload: ${JSON.stringify({ tx_ref: txRef, amount, email: safeEmail, return_url: callbackUrl })}`);

    this.logger.log(
      `Initializing chapa tx ${txRef} for user ${user.id} plan ${planId}`,
    );

    try {
      const res = await axios.post(chapaUrl, payload, {
        headers: {
          Authorization: `Bearer ${chapaKey}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        txRef,
        checkout_url: res.data?.data?.checkout_url,
        chapa: res.data,
      };
    } catch (err: any) {
      const resp = err?.response;

      this.logger.error(
        `Chapa initialize failed: ${resp?.status} ${JSON.stringify(
          resp?.data,
        )}`,
      );

      throw new Error(
        `Chapa initialize error: ${resp?.status} ${JSON.stringify(
          resp?.data,
        )}`,
      );
    }
  }

  async verifyPayment(user: any, txRef: string, planId: string) {
    const chapaKey = this.config.get<string>('CHAPA_SECRET_KEY');

    const verifyUrl = `https://api.chapa.co/v1/transaction/verify/${txRef}`;

    const res = await axios.get(verifyUrl, {
      headers: {
        Authorization: `Bearer ${chapaKey}`,
      },
    });

    const ok =
      res.data?.status === 'success' &&
      res.data?.data?.status === 'success';

    if (!ok) {
      this.logger.warn(
        `Chapa verification failed for ${txRef}: ${JSON.stringify(res.data)}`,
      );
      throw new Error('Payment not successful');
    }
    const sub = await this.plansService.subscribe(
      String(user.id),
      planId,
    );

    return {
      verified: true,
      subscription: sub,
      chapa: res.data,
    };
  }
}