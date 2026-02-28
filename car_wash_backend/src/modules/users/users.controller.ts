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
  UseGuards,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateOwnerProfileDto } from './dto/update-owner-profile.dto';
import { UpdateSalesProfileDto } from './dto/update-sales-profile.dto';
import { UpdateWasherProfileDto } from './dto/update-washer-profile.dto';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from './entities/user.entity';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req: { user: JwtPayload }) {
    return this.usersService.getMe(req.user);
  }

  @Patch('me')
  updateProfile(
    @Req() req: { user: JwtPayload },
    @Body() dto: UpdateOwnerProfileDto | UpdateSalesProfileDto | UpdateWasherProfileDto,
  ) {
    const { user } = req;
    if (user.role === 'OWNER') {
      return this.usersService.updateOwnerProfile(user as any, dto as UpdateOwnerProfileDto);
    }
    if (user.role === 'SALES') {
      return this.usersService.updateSalesProfile(user as any, dto as UpdateSalesProfileDto);
    }
    if (user.role === 'WASHER') {
      return this.usersService.updateWasherProfile(user as any, dto as UpdateWasherProfileDto);
    }
    throw new BadRequestException('Profile update not supported for your role');
  }

  @Post('me/upload/:field')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads/cars', // Dynamic later
        filename: (req, file, cb) => {
          const ext = extname(file.originalname);
          const userId = (req as unknown as { user?: JwtPayload }).user?.id ?? 'unknown';
          const field = (req.params as { field?: string }).field ?? 'file';
          cb(null, `${field}-${userId}${ext}`);
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
  @Get('me/commissions')
  getMyCommissions(@Req() req: { user: JwtPayload }) {
    return this.usersService.getMyCommissions(req.user);
  }

  @Get('admin/sales/monthly-commissions')
  @Roles(UserRole.ADMIN)
  getSalesMonthlyCommissions(
    @Req() req: { user: JwtPayload },
    @Query('year') yearRaw: string,
    @Query('month') monthRaw: string,
  ) {
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    return this.usersService.getSalesMonthlyCommissions(req.user, year, month);
  }

  @Get('admin/sales/tree')
  @Roles(UserRole.ADMIN)
  getSalesTree(@Req() req: { user: JwtPayload }) {
    return this.usersService.getSalesTree(req.user);
  }

  @Post('admin/sales/:salesUserId/approve-monthly-commissions')
  @Roles(UserRole.ADMIN)
  approveSalesMonthlyCommissions(
    @Req() req: { user: JwtPayload },
    @Param('salesUserId') salesUserId: string,
    @Body() body: { year: number; month: number },
  ) {
    return this.usersService.approveSalesMonthlyCommissions(
      req.user,
      salesUserId,
      Number(body?.year),
      Number(body?.month),
    );
  }
}
