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
import { PhoneLoginDto } from './dto/phone-login.dto';
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
  CommissionSource,
} from '../users/entities/sales-commission.entity';
import { WasherProfile } from '../users/entities/washer-profile.entity';
import { SecurityAuditEvent } from './entities/security-audit-event.entity';

type RequestMeta = {
  ip?: string;
  userAgent?: string;
  route?: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(SecurityAuditEvent)
    private securityAuditRepo: Repository<SecurityAuditEvent>,
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

  async sendOtp(dto: SendOtpDto, meta?: RequestMeta) {
    const { phone } = dto;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const key = `otp:${phone}`;
    // Rate limit: max 3 OTPs per 10 min
    const attempts = await this.redis.get(`attempts:${phone}`);
    if (attempts && parseInt(attempts) >= 3) {
      await this.logSecurityEvent({
        eventType: 'OTP_SEND_RATE_LIMITED',
        severity: 'WARN',
        phone,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        route: meta?.route,
      });
      throw new BadRequestException('Too many attempts. Try again later.');
    }

    await this.redis.set(key, otp, 'EX', 300); // 5 min expiry
    await this.redis.incr(`attempts:${phone}`);
    await this.redis.expire(`attempts:${phone}`, 600); // Reset after 10 min

    await this.smsService.sendOtp(phone, otp);
    return { message: 'OTP sent' };
  }

  private async sendOtpForRegistration(
    phone: string,
  ): Promise<{ message: string }> {
    try {
      await this.sendOtp({ phone });
      return { message: 'OTP sent — verify to complete registration' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Registration created but OTP delivery failed for ${phone}: ${reason}`,
      );
      return {
        message:
          'Registration saved, but OTP delivery failed. Please tap resend OTP from login.',
      };
    }
  }

  async verifyOtp(dto: VerifyOtpDto, meta?: RequestMeta) {
    const { phone, otp } = dto;
    const key = `otp:${phone}`;
    const verifyLockKey = `otp_verify_lock:${phone}`;
    const verifyAttemptsKey = `otp_verify_attempts:${phone}`;

    const locked = await this.redis.get(verifyLockKey);
    if (locked) {
      await this.logSecurityEvent({
        eventType: 'OTP_VERIFY_LOCKED',
        severity: 'WARN',
        phone,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        route: meta?.route,
      });
      throw new UnauthorizedException(
        'Too many invalid OTP attempts. Try again later.',
      );
    }

    const storedOtp = await this.redis.get(key);

    const otpStr = String(otp).trim();
    if (!storedOtp || storedOtp !== otpStr) {
      const failedAttempts = await this.redis.incr(verifyAttemptsKey);
      await this.redis.expire(verifyAttemptsKey, 600); // 10 min window
      await this.logSecurityEvent({
        eventType: 'OTP_VERIFY_FAILED',
        severity: 'WARN',
        phone,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        route: meta?.route,
        details: { failedAttempts },
      });
      if (failedAttempts >= 5) {
        await this.redis.set(verifyLockKey, '1', 'EX', 600); // lock 10 min
        await this.logSecurityEvent({
          eventType: 'OTP_VERIFY_LOCK_CREATED',
          severity: 'WARN',
          phone,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          route: meta?.route,
        });
      }
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.redis.del(key);
    await this.redis.del(verifyAttemptsKey);
    await this.redis.del(verifyLockKey);

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

    const deviceId = (dto as any).deviceId ?? undefined;
    return this.issueSessionForUser(user, deviceId);
  }

  async phoneLogin(dto: PhoneLoginDto) {
    const { phone, deviceId } = dto;
    const user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('No account found for this phone');
    }
    if (!user.isActive) {
      throw new UnauthorizedException('Account is not active. Verify OTP first');
    }
    return this.issueSessionForUser(user, deviceId);
  }

  async refresh(refreshToken: string, deviceId?: string, meta?: RequestMeta) {
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

      const storedAny = await this.refreshRepo.findOne({
        where: { tokenHash: hash, user: { id: payload.sub } },
        relations: ['user'],
      });

      if (storedAny?.isRevoked) {
        await this.refreshRepo.update(
          { user: { id: payload.sub } },
          { isRevoked: true },
        );
        await this.logSecurityEvent({
          eventType: 'REFRESH_TOKEN_REUSE_DETECTED',
          severity: 'CRITICAL',
          userId: payload.sub,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          route: meta?.route,
          details: { deviceId },
        });
        throw new UnauthorizedException(
          'Session security check failed. Please login again.',
        );
      }

      if (!storedAny || new Date() > storedAny.expiresAt) {
        await this.refreshRepo.update(
          { user: { id: payload.sub } },
          { isRevoked: true },
        );
        await this.logSecurityEvent({
          eventType: 'REFRESH_TOKEN_INVALID_OR_EXPIRED',
          severity: 'WARN',
          userId: payload.sub,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          route: meta?.route,
          details: { deviceId },
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (deviceId && storedAny.deviceId && storedAny.deviceId !== deviceId) {
        await this.refreshRepo.update(
          { user: { id: payload.sub } },
          { isRevoked: true },
        );
        await this.logSecurityEvent({
          eventType: 'REFRESH_TOKEN_DEVICE_MISMATCH',
          severity: 'CRITICAL',
          userId: payload.sub,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
          route: meta?.route,
          details: {
            expectedDeviceId: storedAny.deviceId,
            gotDeviceId: deviceId,
          },
        });
        throw new UnauthorizedException(
          'Session security check failed. Please login again.',
        );
      }

      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      const newAccess = this.jwtService.sign({ sub: user.id, role: user.role });
      const newRefresh = this.jwtService.sign(
        { sub: user.id },
        {
          secret: refreshSecret,
          expiresIn: this.config.get('jwt.refreshExpires'),
        },
      );

      const newHash = (
        CryptoJS.HmacSHA256(newRefresh, refreshSecret) as CryptoJS.lib.WordArray
      ).toString();

      // Revoke old
      await this.refreshRepo.update(storedAny.id, { isRevoked: true });

      // Save new, preserving deviceId
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      await this.refreshRepo.save({
        tokenHash: newHash,
        user,
        expiresAt,
        deviceId: deviceId ?? storedAny.deviceId,
      });

      return { accessToken: newAccess, refreshToken: newRefresh };
    } catch (err) {
      await this.logSecurityEvent({
        eventType: 'REFRESH_TOKEN_REJECTED',
        severity: 'WARN',
        ip: meta?.ip,
        userAgent: meta?.userAgent,
        route: meta?.route,
        details: {
          reason: err instanceof Error ? err.message : String(err),
        },
      });
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async issueSessionForUser(user: User, deviceId?: string) {
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
      {
        secret: this.config.get<string>('jwt.refreshSecret'),
        expiresIn: this.config.get('jwt.refreshExpires'),
      },
    );

    const secret = String(this.config.get('jwt.refreshSecret'));
    const hash: string = (
      CryptoJS.HmacSHA256(refreshToken, secret) as CryptoJS.lib.WordArray
    ).toString();

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

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

    const otpResult = await this.sendOtpForRegistration(phone);

    return {
      message: `Profile saved. ${otpResult.message}`,
    };
  }

  /**
   * Admin-only: register a sales person. Creates User (SALES, inactive) + SalesProfile, sends OTP.
   * Sales person verifies OTP to activate and get tokens.
   */
  async registerSales(
    creatorUser: { id: string; role: string },
    dto: RegisterSalesDto,
  ) {
    const createdByAdmin = creatorUser.role === UserRole.ADMIN;
    const createdBySales = creatorUser.role === UserRole.SALES;
    if (!createdByAdmin && !createdBySales) {
      throw new UnauthorizedException(
        'Only admin or sales can register sales persons',
      );
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

    let recruiterSalesProfile: SalesProfile | null = null;
    if (createdBySales) {
      recruiterSalesProfile = await this.salesRepo.findOne({
        where: { user: { id: creatorUser.id } },
      });
      if (!recruiterSalesProfile) {
        throw new BadRequestException('Recruiter sales profile not found');
      }
    }

    const profile = this.salesRepo.create({
      user,
      fullName: fullName.trim(),
      nationalId: nationalId.trim(),
      bankDetails,
      sponsorNationalId: sponsorNationalId.trim(),
      nationalIdPhoto: dto.nationalIdPhoto ?? undefined,
      sponsorNationalIdPhoto: dto.sponsorNationalIdPhoto ?? undefined,
      recruitedBySales: recruiterSalesProfile,
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

    if (recruiterSalesProfile) {
      const configuredRecruitAmount = Number(
        this.config.get<number>('commission.amountPerRecruitedSales'),
      );
      const recruitCommissionAmount =
        Number.isFinite(configuredRecruitAmount) &&
        configuredRecruitAmount > 0
          ? configuredRecruitAmount
          : 10;

      await this.salesCommissionRepo.save(
        this.salesCommissionRepo.create({
          salesProfile: recruiterSalesProfile,
          ownerProfile: null,
          recruitedSalesProfile: profile,
          amount: recruitCommissionAmount,
          status: CommissionStatus.PENDING,
          source: CommissionSource.SALES_RECRUITMENT,
        }),
      );
    }

    const otpResult = await this.sendOtpForRegistration(phone);

    return {
      message: `Sales person registered. ${otpResult.message}`,
      recruitedBySalesId: recruiterSalesProfile?.id ?? null,
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

    const existingUser = await this.userRepo.findOne({
      where: { phone },
      relations: ['washerProfile'],
    });
    const canRecoverPartialWasher =
      !!existingUser &&
      existingUser.role === UserRole.WASHER &&
      !existingUser.isActive &&
      !existingUser.washerProfile;

    if (existingUser && !canRecoverPartialWasher) {
      throw new BadRequestException('Phone already registered');
    }

    const existingNationalId = await this.washerRepo.findOne({
      where: { nationalId: nationalId.trim() },
    });
    if (existingNationalId) {
      throw new BadRequestException('National ID already registered');
    }

    const user =
      existingUser && canRecoverPartialWasher
        ? existingUser
        : await this.userRepo.save(
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

    const otpResult = await this.sendOtpForRegistration(phone);

    return {
      message: `Car washer registered. ${otpResult.message}`,
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
      relations: ['recruitedBySales'],
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

    const configuredBaseAmount = Number(
      this.config.get<number>('commission.amountPerOwner'),
    );
    const fallbackBaseAmount =
      Number.isFinite(configuredBaseAmount) && configuredBaseAmount > 0
        ? configuredBaseAmount
        : 10;

    const configuredDirectAmount = Number(
      this.config.get<number>('commission.amountPerOwnerDirect'),
    );
    const directCommissionAmount =
      Number.isFinite(configuredDirectAmount) && configuredDirectAmount > 0
        ? configuredDirectAmount
        : fallbackBaseAmount;

    const configuredRecruiterAmount = Number(
      this.config.get<number>('commission.amountPerOwnerRecruiter'),
    );
    const recruiterCommissionAmount =
      Number.isFinite(configuredRecruiterAmount) && configuredRecruiterAmount > 0
        ? configuredRecruiterAmount
        : Math.max(1, Math.floor(directCommissionAmount / 2));

    await this.salesCommissionRepo.save(
      this.salesCommissionRepo.create({
        salesProfile,
        ownerProfile: profile,
        recruitedSalesProfile: null,
        amount: directCommissionAmount,
        status: CommissionStatus.PENDING,
        source: CommissionSource.OWNER_REGISTRATION,
      }),
    );

    if (
      salesProfile.recruitedBySales &&
      salesProfile.recruitedBySales.id !== salesProfile.id
    ) {
      await this.salesCommissionRepo.save(
        this.salesCommissionRepo.create({
          salesProfile: salesProfile.recruitedBySales,
          ownerProfile: profile,
          recruitedSalesProfile: null,
          amount: recruiterCommissionAmount,
          status: CommissionStatus.PENDING,
          source: CommissionSource.OWNER_REGISTRATION,
        }),
      );
    }

    const otpResult = await this.sendOtpForRegistration(phone);

    return {
      message: `Owner registered. ${otpResult.message} Commission recorded.`,
    };
  }

  private async logSecurityEvent(event: {
    eventType: string;
    severity?: string;
    userId?: string;
    phone?: string;
    ip?: string;
    userAgent?: string;
    route?: string;
    details?: Record<string, unknown>;
  }) {
    try {
      await this.securityAuditRepo.save(
        this.securityAuditRepo.create({
          eventType: event.eventType,
          severity: event.severity ?? 'WARN',
          userId: event.userId,
          phone: event.phone,
          ip: event.ip,
          userAgent: event.userAgent,
          route: event.route,
          details: event.details,
        }),
      );
    } catch (err) {
      this.logger.warn(
        `Failed to write security audit event ${event.eventType}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
