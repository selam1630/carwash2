import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async sendOtp(phone: string, otp: string): Promise<void> {
    const message = `Your Labyajo verification code is ${otp}. It expires in 5 minutes.`;
    await this.sendSms(phone, message);
  }

  async sendSms(phone: string, message: string): Promise<void> {
    const apiKey = this.config.get<string>('sms.providerApiKey')?.trim();
    if (!apiKey) {
      this.logger.warn(`SMS_API_KEY is not set. Skipping SMS to ${phone}`);
      return;
    }

    const baseUrl =
      this.config.get<string>('SMS_ETHIOPIA_BASE_URL')?.trim() ||
      'https://smsethiopia.et/api/sms/send';

    // SMSEthiopia expects msisdn without "+".
    const msisdn = phone.replace(/\s+/g, '').replace(/^\+/, '');

    const payload = {
      msisdn,
      text: message,
    };

    const headers: Record<string, string> = {
      KEY: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    const timeoutMs = Number(
      this.config.get<string>('SMS_ETHIOPIA_TIMEOUT_MS') ?? 15000,
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const body = await resp.text();
        this.logger.error(`SMS provider error ${resp.status}: ${body}`);
        throw new Error(`SMS provider returned ${resp.status}`);
      }

      this.logger.log(`SMS sent to ${phone}`);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      const cause =
        err &&
        typeof err === 'object' &&
        'cause' in err &&
        (err as { cause?: unknown }).cause
          ? JSON.stringify((err as { cause: unknown }).cause)
          : '';
      this.logger.error(
        `Failed to send SMS to ${phone}: ${messageText}${cause ? ` | cause=${cause}` : ''}`,
      );
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
