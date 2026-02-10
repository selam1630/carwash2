import {
  Post,
  Body,
  Controller,
  UseInterceptors,
  BadRequestException,
  UploadedFiles,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import * as path from 'path';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.authService.sendOtp(dto);
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.authService.refresh(refreshToken);
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
        limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
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
 
    if (!files.carFront || !files.carBack || !files.driverLicense) {
      throw new BadRequestException(
        'All three images (car front, car back, driver license) are required',
      );
    }

    return await this.authService.registerOwner(dto, files);
  }
}
