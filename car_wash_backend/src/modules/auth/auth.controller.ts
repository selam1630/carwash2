import {
  Post,
  Body,
  Controller,
  UseInterceptors,
  BadRequestException,
  UploadedFiles,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { PhoneLoginDto } from './dto/phone-login.dto';
import { RegisterSalesDto } from './dto/register-sales.dto';
import { RegisterWasherDto } from './dto/register-washer.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import type { JwtPayload } from './types/jwt-payload.type';
import * as path from 'path';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  private extractMeta(req: any) {
    return {
      ip: req.ip || req.headers?.['x-forwarded-for'] || undefined,
      userAgent: req.headers?.['user-agent'] || undefined,
      route: req.originalUrl || req.url || undefined,
    };
  }

  @Post('send-otp')
  sendOtp(@Req() req: any, @Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto, this.extractMeta(req));
  }

  @Post('verify-otp')
  verifyOtp(@Req() req: any, @Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto, this.extractMeta(req));
  }

  @Post('refresh')
  refresh(@Req() req: any, @Body() dto: RefreshTokenDto) {
    return this.authService.refresh(
      dto.refreshToken,
      dto.deviceId,
      this.extractMeta(req),
    );
  }

  @Post('phone-login')
  phoneLogin(@Body() dto: PhoneLoginDto) {
    return this.authService.phoneLogin(dto);
  }
  @Post('register-owner')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'carFront', maxCount: 1 },
        { name: 'carBack', maxCount: 1 },
        { name: 'driverLicense', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (req, file, cb) => {
            let dir = path.join(process.cwd(), 'uploads/licenses');
            if (file.fieldname.startsWith('car')) {
              dir = path.join(process.cwd(), 'uploads/cars');
            }
            cb(null, dir);
          },
          filename: (req, file, cb) => {
            const uniqueSuffix =
              Date.now() + '-' + Math.round(Math.random() * 1e9);
            cb(
              null,
              `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`,
            );
          },
        }),
        fileFilter: (req, file, cb) => {
          if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
            return cb(
              new BadRequestException('Only JPG/PNG images are allowed'),
              false,
            );
          }
          cb(null, true);
        },
        limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
      },
    ),
  )
  async registerOwner(
    @Body() dto: RegisterOwnerDto,
    @UploadedFiles()
    files: {
      carFront?: Express.Multer.File[];
      carBack?: Express.Multer.File[];
      driverLicense?: Express.Multer.File[];
    },
  ) {
 
    return await this.authService.registerOwner(dto, files);
  }

  /** Admin-only: register a sales person. Sends OTP to their phone; they verify to activate. */
  @Post('admin/register-sales')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  registerSales(
    @Req() req: { user: JwtPayload },
    @Body() dto: RegisterSalesDto,
  ) {
    return this.authService.registerSales(req.user, dto);
  }

  /** Sales-only: register another sales person. Recruiter sales earns referral commission when recruit registers owners. */
  @Post('sales/register-sales')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SALES)
  registerSalesBySales(
    @Req() req: { user: JwtPayload },
    @Body() dto: RegisterSalesDto,
  ) {
    return this.authService.registerSales(req.user, dto);
  }

  /** Admin-only: register a car washer. Sends OTP to their phone; they verify to activate. */
  @Post('admin/register-washer')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  registerWasher(
    @Req() req: { user: JwtPayload },
    @Body() dto: RegisterWasherDto,
  ) {
    return this.authService.registerWasher(req.user, dto);
  }

  /** Sales-only: register a car owner on behalf; sales gets commission. Same body/files as register-owner. */
    @Post('sales/register-owner')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.SALES)
    @UseInterceptors(
      FileFieldsInterceptor(
        [
          { name: 'carFront', maxCount: 1 },
          { name: 'carBack', maxCount: 1 },
          { name: 'driverLicense', maxCount: 1 },
        ],
        {
          storage: diskStorage({
            destination: (req, file, cb) => {
              let dir = path.join(process.cwd(), 'uploads/licenses');
              if (file.fieldname.startsWith('car')) {
                dir = path.join(process.cwd(), 'uploads/cars');
              }
              cb(null, dir);
            },
            filename: (req, file, cb) => {
              const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
              cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
            },
          }),
          fileFilter: (req, file, cb) => {
            if (!file.originalname.match(/\.(jpg|jpeg|png)$/i)) {
              return cb(new BadRequestException('Only JPG/PNG images are allowed'), false);
            }
            cb(null, true);
          },
          limits: { fileSize: 10 * 1024 * 1024 },
        },
      ),
    )
    async registerOwnerBySales(
      @Req() req: { user: JwtPayload },
      @Body() dto: RegisterOwnerDto,
      @UploadedFiles()
      files: { carFront?: Express.Multer.File[]; carBack?: Express.Multer.File[]; driverLicense?: Express.Multer.File[] },
    ) {
      return this.authService.registerOwnerBySales(req.user, dto, files);
    }
  

}
