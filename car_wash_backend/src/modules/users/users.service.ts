import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { OwnerProfile } from './entities/owner-profile.entity';
import { WasherProfile } from './entities/washer-profile.entity';
import { SalesProfile } from './entities/sales-profile.entity';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { UpdateSalesProfileDto } from './dto/update-sales-profile.dto';
import { UpdateWasherProfileDto } from './dto/update-washer-profile.dto';
import { SalesCommission } from './entities/sales-commission.entity';
import { CommissionStatus } from './entities/sales-commission.entity';
import { CommissionSource } from './entities/sales-commission.entity';

export interface JwtUserPayload {
  id: string;
  role: string;
}

export interface SalesTreeNode {
  salesProfileId: string;
  salesUserId: string;
  phone: string | null;
  fullName: string | null;
  nationalId: string;
  recruitedBySalesProfileId: string | null;
  totalCommissionAmount: number;
  pendingCommissionAmount: number;
  paidCommissionAmount: number;
  commissionCount: number;
  ownerRegistrationCommissionCount: number;
  salesRecruitmentCommissionCount: number;
  children: SalesTreeNode[];
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(SalesCommission)
    private commissionRepo: Repository<SalesCommission>,
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(OwnerProfile) private ownerRepo: Repository<OwnerProfile>,
    @InjectRepository(WasherProfile)
    private washerRepo: Repository<WasherProfile>,
    @InjectRepository(SalesProfile)
    private salesRepo: Repository<SalesProfile>,
  ) {}

  async getMe(payload: JwtUserPayload): Promise<User> {
    const fullUser = await this.userRepo.findOne({
      where: { id: payload.id },
      relations: ['ownerProfile', 'salesProfile', 'washerProfile'],
    });
    if (!fullUser) {
      throw new UnauthorizedException('User not found');
    }
    return fullUser;
  }

  async updateOwnerProfile(
    user: JwtUserPayload | User,
    dto: UpdateOwnerProfileDto,
  ) {
    if (user.role !== UserRole.OWNER) {
      throw new BadRequestException('Only owners can update this');
    }
    let profile = await this.ownerRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!profile) {
      profile = this.ownerRepo.create({
        user: { id: user.id } as User,
        ...dto,
      });
    } else {
      Object.assign(profile, dto);
    }
    return this.ownerRepo.save(profile);
  }

  async updateSalesProfile(
    user: JwtUserPayload | User,
    dto: UpdateSalesProfileDto,
  ): Promise<SalesProfile> {
    if (user.role !== UserRole.SALES) {
      throw new BadRequestException('Only sales persons can update this');
    }
    const profile = await this.salesRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!profile) {
      throw new NotFoundException('Sales profile not found');
    }
    Object.assign(profile, dto);
    return this.salesRepo.save(profile);
  }

  async updateWasherProfile(
    user: JwtUserPayload | User,
    dto: UpdateWasherProfileDto,
  ): Promise<WasherProfile> {
    if (user.role !== UserRole.WASHER) {
      throw new BadRequestException('Only washers can update this');
    }
    const profile = await this.washerRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!profile) {
      throw new NotFoundException('Washer profile not found');
    }
    const { depositAmount, ...rest } = dto as UpdateWasherProfileDto & { depositAmount?: number };
    Object.assign(profile, rest);
    if (depositAmount !== undefined) profile.depositeAmount = depositAmount;
    return this.washerRepo.save(profile);
  }

  async uploadPhoto(
    user: JwtUserPayload | User,
    field: string,
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    const ext = file.originalname.split('.').pop();
    const filename = `${field}-${user.id}.${ext}`;
    let path: string | null = null;

    if (user.role === UserRole.OWNER) {
      if (!['carFront', 'carBack', 'driverLicense'].includes(field)) {
        throw new BadRequestException('Invalid field');
      }
      path = `uploads/${field.startsWith('car') ? 'cars' : 'licenses'}/${filename}`;
      const profile = await this.ownerRepo.findOne({
        where: { user: { id: user.id } },
      });
      if (!profile) throw new NotFoundException('Create profile first');
      if (field === 'carFront') profile.carFrontPhoto = path;
      if (field === 'carBack') profile.carBackPhoto = path;
      if (field === 'driverLicense') profile.driverLicensePhoto = path;
      await this.ownerRepo.save(profile);
    }
    // Washer similar later

    // In production: fs.rename or upload to cloud
    // For dev: assume Multer stores it
    if (!path) {
      throw new BadRequestException('Photo upload not supported for this user role or field');
    }
    return { message: 'Uploaded', path };
  }
  async getMyCommissions(user: { id: string; role: string }): Promise<SalesCommission[]> {
    if (user.role !== UserRole.SALES) {
      throw new BadRequestException('Only sales can view commissions');
    }
    const salesProfile = await this.salesRepo.findOne({
      where: { user: { id: user.id } },
    });
    if (!salesProfile) return [];
    return this.commissionRepo.find({
      where: { salesProfile: { id: salesProfile.id } },
      relations: [
        'ownerProfile',
        'ownerProfile.user',
        'recruitedSalesProfile',
        'recruitedSalesProfile.user',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async getSalesTree(requester: { id: string; role: string }) {
    if (requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can view sales tree');
    }

    const salesProfiles = await this.salesRepo.find({
      relations: ['user', 'recruitedBySales', 'recruitedBySales.user'],
      order: { createdAt: 'ASC' },
    });

    const commissionRows = await this.commissionRepo.find({
      relations: ['salesProfile'],
      order: { createdAt: 'ASC' },
    });

    const commissionBySalesProfile = new Map<
      string,
      {
        totalCommissionAmount: number;
        pendingCommissionAmount: number;
        paidCommissionAmount: number;
        commissionCount: number;
        ownerRegistrationCommissionCount: number;
        salesRecruitmentCommissionCount: number;
      }
    >();

    for (const row of commissionRows) {
      const salesProfileId = row.salesProfile?.id;
      if (!salesProfileId) continue;
      const amount = Number(row.amount ?? 0);
      const current = commissionBySalesProfile.get(salesProfileId) ?? {
        totalCommissionAmount: 0,
        pendingCommissionAmount: 0,
        paidCommissionAmount: 0,
        commissionCount: 0,
        ownerRegistrationCommissionCount: 0,
        salesRecruitmentCommissionCount: 0,
      };
      current.commissionCount += 1;
      current.totalCommissionAmount += amount;
      if (row.status === CommissionStatus.PAID) {
        current.paidCommissionAmount += amount;
      } else {
        current.pendingCommissionAmount += amount;
      }
      if (row.source === CommissionSource.SALES_RECRUITMENT) {
        current.salesRecruitmentCommissionCount += 1;
      } else {
        current.ownerRegistrationCommissionCount += 1;
      }
      commissionBySalesProfile.set(salesProfileId, current);
    }

    const nodes = new Map<string, SalesTreeNode>();
    for (const p of salesProfiles) {
      const commission = commissionBySalesProfile.get(p.id);
      nodes.set(p.id, {
        salesProfileId: p.id,
        salesUserId: p.user?.id ?? '',
        phone: p.user?.phone ?? null,
        fullName: p.fullName ?? null,
        nationalId: p.nationalId,
        recruitedBySalesProfileId: p.recruitedBySales?.id ?? null,
        totalCommissionAmount: commission?.totalCommissionAmount ?? 0,
        pendingCommissionAmount: commission?.pendingCommissionAmount ?? 0,
        paidCommissionAmount: commission?.paidCommissionAmount ?? 0,
        commissionCount: commission?.commissionCount ?? 0,
        ownerRegistrationCommissionCount:
            commission?.ownerRegistrationCommissionCount ?? 0,
        salesRecruitmentCommissionCount:
            commission?.salesRecruitmentCommissionCount ?? 0,
        children: [],
      });
    }

    const roots: SalesTreeNode[] = [];
    for (const node of nodes.values()) {
      if (!node.recruitedBySalesProfileId) {
        roots.push(node);
        continue;
      }
      const parent = nodes.get(node.recruitedBySalesProfileId);
      if (!parent || parent.salesProfileId === node.salesProfileId) {
        roots.push(node);
        continue;
      }
      parent.children.push(node);
    }

    const flatten = (items: SalesTreeNode[]): SalesTreeNode[] => {
      const result: SalesTreeNode[] = [];
      for (const item of items) {
        result.push(item);
        if (item.children.length > 0) {
          result.push(...flatten(item.children));
        }
      }
      return result;
    };

    return {
      roots,
      totalSales: salesProfiles.length,
      rootCount: roots.length,
      maxDepth: this.computeMaxDepth(roots),
      flat: flatten(roots).map((n) => ({
        salesProfileId: n.salesProfileId,
        salesUserId: n.salesUserId,
        phone: n.phone,
        fullName: n.fullName,
        nationalId: n.nationalId,
        recruitedBySalesProfileId: n.recruitedBySalesProfileId,
        totalCommissionAmount: n.totalCommissionAmount,
        pendingCommissionAmount: n.pendingCommissionAmount,
        paidCommissionAmount: n.paidCommissionAmount,
        commissionCount: n.commissionCount,
        ownerRegistrationCommissionCount: n.ownerRegistrationCommissionCount,
        salesRecruitmentCommissionCount: n.salesRecruitmentCommissionCount,
      })),
    };
  }

  private computeMaxDepth(nodes: SalesTreeNode[]): number {
    if (nodes.length === 0) return 0;
    const depth = (node: SalesTreeNode): number => {
      if (node.children.length === 0) return 1;
      return 1 + Math.max(...node.children.map(depth));
    };
    return Math.max(...nodes.map(depth));
  }

  async getSalesMonthlyCommissions(
    requester: { id: string; role: string },
    year: number,
    month: number,
  ) {
    if (requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can view sales monthly commissions');
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('year/month are required and month must be 1..12');
    }

    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 1, 0, 0, 0));

    const commissions = await this.commissionRepo.find({
      where: { createdAt: Between(from, to) },
      relations: [
        'salesProfile',
        'salesProfile.user',
        'ownerProfile',
        'ownerProfile.user',
        'recruitedSalesProfile',
        'recruitedSalesProfile.user',
      ],
      order: { createdAt: 'DESC' },
    });

    const grouped = new Map<
      string,
      {
        salesProfileId: string;
        salesUserId: string;
        salesPhone: string | null;
        salesFullName: string | null;
        registrationsCount: number;
        pendingCount: number;
        paidCount: number;
        pendingAmount: number;
        paidAmount: number;
        totalAmount: number;
        ownerRegistrationCount: number;
        salesRecruitmentCount: number;
      }
    >();

    for (const c of commissions) {
      const salesProfileId = c.salesProfile?.id;
      if (!salesProfileId) continue;
      const amount = Number(c.amount ?? 0);
      const existing = grouped.get(salesProfileId) ?? {
        salesProfileId,
        salesUserId: c.salesProfile.user?.id ?? '',
        salesPhone: c.salesProfile.user?.phone ?? null,
        salesFullName: c.salesProfile.fullName ?? null,
        registrationsCount: 0,
        pendingCount: 0,
        paidCount: 0,
        pendingAmount: 0,
        paidAmount: 0,
        totalAmount: 0,
        ownerRegistrationCount: 0,
        salesRecruitmentCount: 0,
      };

      existing.registrationsCount += 1;
      existing.totalAmount += amount;
      if (c.status === CommissionStatus.PAID) {
        existing.paidCount += 1;
        existing.paidAmount += amount;
      } else {
        existing.pendingCount += 1;
        existing.pendingAmount += amount;
      }
      if (c.source === CommissionSource.SALES_RECRUITMENT) {
        existing.salesRecruitmentCount += 1;
      } else {
        existing.ownerRegistrationCount += 1;
      }
      grouped.set(salesProfileId, existing);
    }

    const items = Array.from(grouped.values()).sort((a, b) => b.pendingAmount - a.pendingAmount);
    return {
      year,
      month,
      items,
      summary: {
        totalSalesPeople: items.length,
        totalRegistrations: items.reduce((sum, x) => sum + x.registrationsCount, 0),
        totalPendingAmount: items.reduce((sum, x) => sum + x.pendingAmount, 0),
        totalPaidAmount: items.reduce((sum, x) => sum + x.paidAmount, 0),
      },
    };
  }

  async approveSalesMonthlyCommissions(
    requester: { id: string; role: string },
    salesUserId: string,
    year: number,
    month: number,
  ) {
    if (requester.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can approve sales commissions');
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('year/month are required and month must be 1..12');
    }

    const salesProfile = await this.salesRepo.findOne({
      where: { user: { id: salesUserId } },
      relations: ['user'],
    });
    if (!salesProfile) {
      throw new NotFoundException('Sales profile not found');
    }

    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 1, 0, 0, 0));

    const pending = await this.commissionRepo.find({
      where: {
        salesProfile: { id: salesProfile.id },
        status: CommissionStatus.PENDING,
        createdAt: Between(from, to),
      },
    });

    if (pending.length === 0) {
      return {
        message: 'No pending commissions found for this sales person in selected month',
        approvedCount: 0,
        approvedAmount: 0,
      };
    }

    let amount = 0;
    for (const c of pending) {
      c.status = CommissionStatus.PAID;
      amount += Number(c.amount ?? 0);
    }
    await this.commissionRepo.save(pending);

    return {
      message: 'Monthly commissions approved',
      approvedCount: pending.length,
      approvedAmount: amount,
      salesUserId,
      year,
      month,
    };
  }
}
