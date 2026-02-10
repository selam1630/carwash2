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
import { RegisterOwnerDto } from './dto/register-owner.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
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

    let user = await this.userRepo.findOne({
      where: { phone },
      relations: ['ownerProfile'],
    });
    if (!user) {
      throw new UnauthorizedException(
        'No registration or account found for this phone',
      );
    }
    // Activate if pending registration (owner must have profile; others just activate)
    if (!user.isActive) {
      if (user.role === UserRole.OWNER && !user.ownerProfile) {
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

    await this.refreshRepo.save({
      tokenHash: hash,
      user,
      expiresAt,
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

  async refresh(refreshToken: string) {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new BadRequestException('refreshToken is required');
    }
    const refreshSecret = String(this.config.get('jwt.refreshSecret'));
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
      });

      const hash = (
        CryptoJS.HmacSHA256(refreshToken, refreshSecret) as CryptoJS.lib.WordArray
      ).toString();
      const stored = await this.refreshRepo.findOne({
        where: { tokenHash: hash, isRevoked: false, user: { id: payload.sub } },
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

      // Save new
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      await this.refreshRepo.save({
        tokenHash: newHash,
        user,
        expiresAt,
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
    profile.carFrontPhoto = files.carFront![0].path;
    profile.carBackPhoto = files.carBack![0].path;
    profile.driverLicensePhoto = files.driverLicense
      ? files.driverLicense[0].path
      : undefined;

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
}
