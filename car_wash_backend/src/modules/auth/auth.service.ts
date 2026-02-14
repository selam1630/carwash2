import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entities';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SmsService } from './sms.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as CryptoJS from 'crypto-js';
import { Express } from 'express';
import { OwnerProfile } from '../users/entities/owner-profile.entity';
import { SalesProfile } from '../users/entities/sales-profile.entity';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { RegisterSalesDto } from './dto/register-sales.dto';
import { RegisterWasherDto } from './dto/register-washer.dto';
import {
  SalesCommission,
  CommissionStatus,
} from '../users/entities/sales-commission.entity';
import { WasherProfile } from '../users/entities/washer-profile.entity';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(SalesProfile)
    private salesRepo: Repository<SalesProfile>,
    @InjectRepository(SalesCommission)
    private salesCommissionRepo: Repository<SalesCommission>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshRepo: Repository<RefreshToken>,
    private smsService: SmsService,
    @InjectRedis()
    private readonly redis: Redis,
    private jwtService: JwtService,
    private config: ConfigService,
    @InjectRepository(OwnerProfile)
    private ownerRepo: Repository<OwnerProfile>,
    @InjectRepository(WasherProfile)
    private washerRepo: Repository<WasherProfile>,
  ) {
    this.redis.on('error', (err) =>
      this.logger.warn('Redis connection error: ' + err.message),
    );
  }

  async sendOtp(dto: SendOtpDto) {
    const { phone } = dto;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `otp:${phone}`;
    // Rate limit: max 3 OTPs per 10 min
    const attempts = await this.redis.get(`attempts:${phone}`);
    if (attempts && parseInt(attempts) >= 3) {
      throw new BadRequestException('Too many attempts. Try again later.');
    }

    await this.redis.set(key, otp, 'EX', 300); // 5 min expiry
    await this.redis.incr(`attempts:${phone}`);
    await this.redis.expire(`attempts:${phone}`, 600); // Reset after 10 min

    await this.smsService.sendOtp(phone, otp);
    return { message: 'OTP sent' };
  }

  async verifyOtp(dto: VerifyOtpDto) {
    const { phone, otp } = dto;
    const key = `otp:${phone}`;
    const storedOtp = await this.redis.get(key);

    const otpStr = String(otp).trim();
    if (!storedOtp || storedOtp !== otpStr) {
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.redis.del(key);

    const user = await this.userRepo.findOne({
      where: { phone },
      relations: ['ownerProfile', 'salesProfile', 'washerProfile'],
    });
    if (!user) {
      throw new UnauthorizedException(
        'No registration or account found for this phone',
      );
    }
    // Activate if pending registration (owner/washer must have profile; others just activate)
    if (!user.isActive) {
      if (user.role === UserRole.OWNER && !user.ownerProfile) {
        throw new UnauthorizedException('Please complete registration first');
      }
      if (user.role === UserRole.WASHER && !user.washerProfile) {
        throw new UnauthorizedException('Please complete registration first');
      }
      user.isActive = true;
      await this.userRepo.save(user);
    }

    // Invalidate old sessions (single device)
    await this.refreshRepo.update(
      { user: { id: user.id } },
      { isRevoked: true },
    );

    const accessToken = this.jwtService.sign(
      { sub: user.id, role: user.role },
      { expiresIn: this.config.get('jwt.accessExpires') },
    );

    const refreshToken = this.jwtService.sign(
      { sub: user.id },
      { expiresIn: this.config.get('jwt.refreshExpires') },
    );

    const secret = String(this.config.get('jwt.refreshSecret'));
    const hash: string = (
      CryptoJS.HmacSHA256(refreshToken, secret) as CryptoJS.lib.WordArray
    ).toString();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Save refresh token with optional deviceId (if provided by client)
    const deviceId = (dto as any).deviceId ?? undefined;

    await this.refreshRepo.save({
      tokenHash: hash,
      user,
      expiresAt,
      deviceId,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        phone: user.phone,
        role: user.role,
        isActive: user.isActive,
      },
    };
  }

  async refresh(refreshToken: string, deviceId?: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new BadRequestException('refreshToken is required');
    }
    const refreshSecret = String(this.config.get('jwt.refreshSecret'));
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      const hash = (
        CryptoJS.HmacSHA256(
          refreshToken,
          refreshSecret,
        ) as CryptoJS.lib.WordArray
      ).toString();

      // If deviceId provided, require matching deviceId on stored token
      const whereClause: any = { tokenHash: hash, isRevoked: false, user: { id: payload.sub } };
      if (deviceId) whereClause.deviceId = deviceId;

      const stored = await this.refreshRepo.findOne({
        where: whereClause,
      });

      if (!stored || new Date() > stored.expiresAt) {
        throw new UnauthorizedException();
      }

      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newAccess = this.jwtService.sign({ sub: user.id, role: user.role });
      const newRefresh = this.jwtService.sign(
        { sub: user.id },
        { expiresIn: '30d' },
      );

      const newHash = (
        CryptoJS.HmacSHA256(newRefresh, refreshSecret) as CryptoJS.lib.WordArray
      ).toString();

      // Revoke old
      await this.refreshRepo.update(stored.id, { isRevoked: true });

      // Save new, preserving deviceId
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      await this.refreshRepo.save({
        tokenHash: newHash,
        user,
        expiresAt,
        deviceId: deviceId ?? stored.deviceId,
      });

      return { accessToken: newAccess, refreshToken: newRefresh };
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
  async registerOwner(
    dto: RegisterOwnerDto,
    files: {
      carFront?: Express.Multer.File[];
      carBack?: Express.Multer.File[];
      driverLicense?: Express.Multer.File[];
    },
  ) {
    const { phone, fullName, carType, plateNumber, secondaryPhone } = dto;
    const clean = (str: string) => str?.replace(/^"|"$/g, '').trim();

    const existing = await this.userRepo.findOne({ where: { phone } });
    if (existing) {
      throw new BadRequestException('Phone already registered');
    }

    const cleanPlate = clean(plateNumber);
    const existingPlate = await this.ownerRepo.findOne({
      where: { plateNumber: cleanPlate },
    });
    if (existingPlate) {
      throw new BadRequestException('Plate number already registered');
    }

    const user = await this.userRepo.save(
      this.userRepo.create({
        phone,
        role: UserRole.OWNER,
        isActive: false,
      }),
    );
    const profile = new OwnerProfile();
    profile.user = user;
    profile.fullName = clean(fullName);
    profile.carType = clean(carType);
    profile.plateNumber = cleanPlate;
    profile.secondaryPhone = secondaryPhone ?? undefined;
    if (files.carFront && files.carFront.length > 0) {
      profile.carFrontPhoto = files.carFront[0].path;
    }
    if (files.carBack && files.carBack.length > 0) {
      profile.carBackPhoto = files.carBack[0].path;
    }
    profile.driverLicensePhoto = files.driverLicense ? files.driverLicense[0].path : undefined;

    try {
      await this.ownerRepo.save(profile);
    } catch (err) {
      const code =
        err instanceof QueryFailedError
          ? (err.driverError as { code?: string })?.code
          : undefined;
      if (code === '23505') {
        throw new BadRequestException('Plate number already registered');
      }
      throw err;
    }

    await this.sendOtp({ phone });

    return {
      message: 'Profile saved. OTP sent — verify to complete registration',
    };
  }

  /**
   * Admin-only: register a sales person. Creates User (SALES, inactive) + SalesProfile, sends OTP.
   * Sales person verifies OTP to activate and get tokens.
   */
  async registerSales(
    adminUser: { id: string; role: string },
    dto: RegisterSalesDto,
  ) {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Only admin can register sales persons');
    }

    const { phone, fullName, nationalId, bankDetails, sponsorNationalId } = dto;

    const existingUser = await this.userRepo.findOne({ where: { phone } });
    if (existingUser) {
      throw new BadRequestException('Phone already registered');
    }

    const existingNationalId = await this.salesRepo.findOne({
      where: { nationalId },
    });
    if (existingNationalId) {
      throw new BadRequestException('National ID already registered');
    }

    const user = await this.userRepo.save(
      this.userRepo.create({
        phone,
        role: UserRole.SALES,
        isActive: false,
      }),
    );

    const profile = this.salesRepo.create({
      user,
      fullName: fullName.trim(),
      nationalId: nationalId.trim(),
      bankDetails,
      sponsorNationalId: sponsorNationalId.trim(),
      nationalIdPhoto: dto.nationalIdPhoto ?? undefined,
      sponsorNationalIdPhoto: dto.sponsorNationalIdPhoto ?? undefined,
    });

    try {
      await this.salesRepo.save(profile);
    } catch (err) {
      const code =
        err instanceof QueryFailedError
          ? (err.driverError as { code?: string })?.code
          : undefined;
      if (code === '23505') {
        throw new BadRequestException('National ID already registered');
      }
      throw err;
    }

    await this.sendOtp({ phone });

    return {
      message:
        'Sales person registered. OTP sent to phone — they must verify to activate.',
    };
  }

  /**
   * Admin-only: register a car washer. Creates User (WASHER, inactive) + WasherProfile, sends OTP.
   * Washer verifies OTP to activate and get tokens.
   */
  async registerWasher(
    adminUser: { id: string; role: string },
    dto: RegisterWasherDto,
  ) {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new UnauthorizedException('Only admin can register car washers');
    }

    const { phone, fullName, nationalId, sponsorNationalId, bankDetails, depositeAmount } = dto;

    const existingUser = await this.userRepo.findOne({ where: { phone } });
    if (existingUser) {
      throw new BadRequestException('Phone already registered');
    }

    const existingNationalId = await this.washerRepo.findOne({
      where: { nationalId: nationalId.trim() },
    });
    if (existingNationalId) {
      throw new BadRequestException('National ID already registered');
    }

    const user = await this.userRepo.save(
      this.userRepo.create({
        phone,
        role: UserRole.WASHER,
        isActive: false,
      }),
    );

    const profile = this.washerRepo.create({
      user,
      phone,
      fullName: fullName.trim(),
      nationalId: nationalId.trim(),
      sponsorNationalId: sponsorNationalId.trim(),
      bankDetails,
      depositeAmount: Number(depositeAmount),
      mugShot: dto.mugShot ?? undefined,
      nationalIdPhoto: dto.nationalIdPhoto ?? undefined,
      sponsorNationalIdPhoto: dto.sponsorNationalIdPhoto ?? undefined,
    });

    try {
      await this.washerRepo.save(profile);
    } catch (err) {
      const code =
        err instanceof QueryFailedError
          ? (err.driverError as { code?: string })?.code
          : undefined;
      if (code === '23505') {
        throw new BadRequestException('National ID already registered');
      }
      throw err;
    }

    await this.sendOtp({ phone });

    return {
      message:
        'Car washer registered. OTP sent to phone — they must verify to activate.',
    };
  }

  /**
   * Sales-only: register a car owner on behalf of a customer. Sales person gets commission.
   */
   async registerOwnerBySales(
    salesUser: { id: string; role: string },
    dto: RegisterOwnerDto,
    files: {
      carFront?: Express.Multer.File[];
      carBack?: Express.Multer.File[];
      driverLicense?: Express.Multer.File[];
    },
  ) {
    if (salesUser.role !== UserRole.SALES) {
      throw new UnauthorizedException('Only sales can register owners on behalf');
    }

    const salesProfile = await this.salesRepo.findOne({
      where: { user: { id: salesUser.id } },
    });
    if (!salesProfile) {
      throw new BadRequestException('Sales profile not found');
    }

    const { phone, fullName, carType, plateNumber, secondaryPhone } = dto;
    const clean = (str: string) => str?.replace(/^"|"$/g, '').trim();

    const existingUser = await this.userRepo.findOne({ where: { phone } });
    if (existingUser) {
      throw new BadRequestException('Phone already registered');
    }

    const cleanPlate = clean(plateNumber);
    const existingPlate = await this.ownerRepo.findOne({
      where: { plateNumber: cleanPlate },
    });
    if (existingPlate) {
      throw new BadRequestException('Plate number already registered');
    }

    const user = await this.userRepo.save(
      this.userRepo.create({
        phone,
        role: UserRole.OWNER,
        isActive: false,
      }),
    );

    const profile = new OwnerProfile();
    profile.user = user;
    profile.fullName = clean(fullName);
    profile.carType = clean(carType);
    profile.plateNumber = cleanPlate;
    profile.secondaryPhone = secondaryPhone ?? undefined;
    if (files.carFront && files.carFront.length > 0) {
      profile.carFrontPhoto = files.carFront[0].path;
    }
    if (files.carBack && files.carBack.length > 0) {
      profile.carBackPhoto = files.carBack[0].path;
    }
    profile.driverLicensePhoto = files.driverLicense?.[0]?.path;
    profile.registeredBySales = salesProfile;

    try {
      await this.ownerRepo.save(profile);
    } catch (err) {
      const code =
        err instanceof QueryFailedError
          ? (err.driverError as { code?: string })?.code
          : undefined;
      if (code === '23505') {
        throw new BadRequestException('Plate number already registered');
      }
      throw err;
    }

    const commissionAmount = Number(this.config.get<number>('commission.amountPerOwner') ?? 50);
    await this.salesCommissionRepo.save(
      this.salesCommissionRepo.create({
        salesProfile,
        ownerProfile: profile,
        amount: commissionAmount,
        status: CommissionStatus.PENDING,
      }),
    );

    await this.sendOtp({ phone });

    return {
      message: 'Owner registered. OTP sent — they must verify to activate. Commission recorded.',
    };
  }
}
