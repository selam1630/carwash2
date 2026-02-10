import {
  Controller,
  Get,
  Patch,
  Body,
  Req,
  Post,
  Param,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';

// Extend Express Request type to include 'user'
declare module 'express' {
  export interface Request {
    user?: any;
  }
}

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req) {
    return this.usersService.getMe(req.user);
  }

  @Patch('me')
  updateProfile(@Req() req, @Body() dto: UpdateOwnerProfileDto) {
    return this.usersService.updateOwnerProfile(req.user, dto);
  }

  @Post('me/upload/:field')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/cars', // Dynamic later
        filename: (req, file, cb) => {
          const ext = extname(file.originalname);
          cb(null, `${req.params.field}-${req.user.id}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
          return cb(new Error('Only images'), false);
        }
        cb(null, true);
      },
    }),
  )
  uploadPhoto(
    @Req() req,
    @Param('field') field: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.usersService.uploadPhoto(req.user, field, file);
  }
}
