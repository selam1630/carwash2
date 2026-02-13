import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { OwnerProfile } from './entities/owner-profile.entity';
import { WasherProfile } from './entities/washer-profile.entity';
import { SalesProfile } from './entities/sales-profile.entity';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { UpdateSalesProfileDto } from './dto/update-sales-profile.dto';
import { UpdateWasherProfileDto } from './dto/update-washer-profile.dto';
import { SalesCommission } from './entities/sales-commission.entity';

export interface JwtUserPayload {
  id: string;
  role: string;
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
      relations: ['ownerProfile', 'ownerProfile.user'],
      order: { createdAt: 'DESC' },
    });
  }
}
