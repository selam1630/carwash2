import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

    if (!storedOtp || storedOtp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    await this.redis.del(key);

    let user = await this.userRepo.findOne({ where: { phone } });
    if (!user) {
      user = this.userRepo.create({ phone, role: UserRole.OWNER });
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
      user: { id: user.id, phone: user.phone, role: user.role },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.config.get('jwt.refreshSecret'),
      });

      const hash = CryptoJS.HmacSHA256(
        refreshToken,
        this.config.get('jwt.refreshSecret'),
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

      const newHash = CryptoJS.HmacSHA256(
        newRefresh,
        this.config.get('jwt.refreshSecret'),
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
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
