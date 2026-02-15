import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { OwnerSubscription } from './entities/owner-subscription.entity';
import { OwnerProfile } from '../users/entities/owner-profile.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private planRepo: Repository<Plan>,
    @InjectRepository(OwnerSubscription)
    private subRepo: Repository<OwnerSubscription>,
    @InjectRepository(OwnerProfile)
    private ownerRepo: Repository<OwnerProfile>,
  ) {}

  /** Owner subscribes to a plan. Expires at end of current month. */
  async subscribe(ownerUserId: string, planId: string): Promise<OwnerSubscription> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Plan not found');

    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerUserId } } });
    if (!owner) throw new BadRequestException('Owner profile not found');

    // compute end of current month
    const now = new Date();
    const expires = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const sub = this.subRepo.create({
      ownerProfile: owner,
      plan,
      expiresAt: expires,
      washesUsed: 0,
    });
    return this.subRepo.save(sub);
  }

  async getOwnerSubscription(ownerUserId: string): Promise<OwnerSubscription | null> {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerUserId } } });
    if (!owner) return null;
    const now = new Date();
    const sub = await this.subRepo.findOne({ where: { ownerProfile: { id: owner.id }, expiresAt: MoreThan(now) }, relations: ['plan'] });
    return sub ?? null;
  }

  async cancelSubscription(ownerUserId: string): Promise<{ message: string }> {
    const owner = await this.ownerRepo.findOne({ where: { user: { id: ownerUserId } } });
    if (!owner) throw new BadRequestException('Owner profile not found');
    const now = new Date();
    const sub = await this.subRepo.findOne({ where: { ownerProfile: { id: owner.id }, expiresAt: MoreThan(now) } });
    if (!sub) return { message: 'No active subscription' };
    sub.expiresAt = new Date();
    await this.subRepo.save(sub);
    return { message: 'Subscription cancelled' };
  }

  async findAll(activeOnly = false): Promise<Plan[]> {
    return this.planRepo.find({
      where: activeOnly ? { isActive: true } : undefined,
      order: { washesPerMonth: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Plan> {
    const plan = await this.planRepo.findOne({ where: { id } });
    if (!plan) {
      throw new NotFoundException('Plan not found');
    }
    return plan;
  }

  async create(dto: CreatePlanDto): Promise<Plan> {
    const existing = await this.planRepo.findOne({
      where: { washesPerMonth: dto.washesPerMonth },
    });
    if (existing) {
      throw new BadRequestException(
        `A plan with ${dto.washesPerMonth} washes per month already exists`,
      );
    }
    return this.planRepo.save(this.planRepo.create(dto));
  }

  async update(id: string, dto: UpdatePlanDto): Promise<Plan> {
    const plan = await this.findOne(id);
    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  async remove(id: string): Promise<{ message: string }> {
    const plan = await this.findOne(id);
    await this.planRepo.remove(plan);
    return { message: 'Plan deleted' };
  }
}
