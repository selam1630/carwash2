import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Plan } from './entities/plan.entity';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';

@Injectable()
export class PlansService {
  constructor(
    @InjectRepository(Plan)
    private planRepo: Repository<Plan>,
  ) {}

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
