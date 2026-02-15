import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { OwnerSubscription } from './entities/owner-subscription.entity';
import { SmsService } from '../auth/sms.service';

@Injectable()
export class SubscriptionsNotifier {
  private readonly logger = new Logger(SubscriptionsNotifier.name);

  constructor(
    @InjectRepository(OwnerSubscription)
    private subRepo: Repository<OwnerSubscription>,
    private sms: SmsService,
  ) {}

  // Run every hour
  @Interval(60 * 60 * 1000)
  async handleExpiredSubscriptions() {
    const now = new Date();
    try {
      const expired = await this.subRepo.find({
        where: { expiresAt: LessThanOrEqual(now), notified: false },
        relations: ['ownerProfile', 'ownerProfile.user', 'plan'],
      });
      if (!expired || expired.length === 0) return;
      for (const s of expired) {
        const phone = s.ownerProfile?.user?.phone;
        if (!phone) continue;
        const planName = s.plan?.name ?? 'your subscription';
        const msg = `Your ${planName} subscription has expired. Please create a new subscription to continue receiving service.`;
        await this.sms.sendSms(phone, msg);
        s.notified = true;
        await this.subRepo.save(s);
        this.logger.log(`Notified ${phone} about expired subscription ${s.id}`);
      }
    } catch (err) {
      this.logger.warn('Error checking expired subscriptions: ' + err.message);
    }
  }
}
