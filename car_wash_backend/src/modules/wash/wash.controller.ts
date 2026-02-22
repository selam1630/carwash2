import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateWashRequestDto } from './dto/create-wash-request.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { WasherPresenceDto } from './dto/washer-presence.dto';
import { OwnerConfirmCompletionDto } from './dto/owner-confirm-completion.dto';
import { WashGateway } from './wash.gateway';
import { WashService } from './wash.service';

@Controller('wash')
@UseGuards(JwtAuthGuard, RolesGuard)
export class WashController {
  constructor(
    private readonly washService: WashService,
    private readonly washGateway: WashGateway,
  ) {}

  @Post('requests')
  @Roles(UserRole.OWNER)
  async createRequest(@Req() req: any, @Body() dto: CreateWashRequestDto) {
    const created = await this.washService.create(req.user, dto);
    await this.washGateway.emitRequestCreated(created);
    return created;
  }

  @Get('requests/open')
  @Roles(UserRole.WASHER, UserRole.ADMIN)
  async listOpenRequests(@Req() req: any) {
    return this.washService.listOpenForUser(req.user);
  }

  @Get('requests/active')
  @Roles(UserRole.OWNER)
  async ownerActiveRequest(@Req() req: any) {
    return this.washService.getActiveForOwner(req.user);
  }

  @Get('requests/active-washer')
  @Roles(UserRole.WASHER, UserRole.ADMIN)
  async washerActiveRequest(@Req() req: any) {
    return this.washService.getActiveForWasher(req.user);
  }

  @Post('requests/:id/accept')
  @Roles(UserRole.WASHER, UserRole.ADMIN)
  async acceptRequest(@Req() req: any, @Param('id') requestId: string) {
    const accepted = await this.washService.accept(req.user, requestId);
    this.washGateway.emitRequestAccepted(accepted);
    return accepted;
  }

  @Post('requests/:id/location')
  @Roles(UserRole.WASHER)
  async updateLocation(
    @Req() req: any,
    @Param('id') requestId: string,
    @Body() dto: UpdateLocationDto,
  ) {
    const payload = await this.washService.updateWasherLocation(req.user, requestId, dto);
    this.washGateway.emitWasherLocation(payload);
    return { ok: true };
  }

  @Post('requests/:id/finish')
  @Roles(UserRole.WASHER)
  @UseInterceptors(
    FileInterceptor('afterPhoto', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const dir = join(process.cwd(), 'uploads/wash');
          if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
          }
          cb(null, dir);
        },
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `after-${unique}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  async finishByWasher(
    @Req() req: any,
    @Param('id') requestId: string,
    @UploadedFile() afterPhoto?: Express.Multer.File,
  ) {
    if (!afterPhoto?.path) {
      throw new BadRequestException('afterPhoto is required');
    }
    const saved = await this.washService.submitCompletionByWasher(
      req.user,
      requestId,
      afterPhoto.path,
    );
    this.washGateway.emitCompletionRequested(saved);
    return saved;
  }

  @Post('requests/:id/complete')
  @Roles(UserRole.OWNER)
  async completeByOwner(@Req() req: any, @Param('id') requestId: string) {
    const completed = await this.washService.completeByOwner(req.user, requestId);
    this.washGateway.emitRequestCompleted(completed);
    return completed;
  }

  @Post('requests/:id/owner-confirm')
  @Roles(UserRole.OWNER)
  async ownerConfirm(
    @Req() req: any,
    @Param('id') requestId: string,
    @Body() dto: OwnerConfirmCompletionDto,
  ) {
    const updated = await this.washService.ownerConfirmCompletion(
      req.user,
      requestId,
      dto.approved,
    );
    if (dto.approved) {
      this.washGateway.emitRequestCompleted(updated);
    } else {
      await this.washGateway.emitRequestReopened(updated);
    }
    return updated;
  }

  @Get('washers/:washerId/monthly-completed')
  @Roles(UserRole.ADMIN, UserRole.WASHER)
  async washerMonthlyCompleted(
    @Req() req: any,
    @Param('washerId') washerId: string,
    @Query('year') yearRaw: string,
    @Query('month') monthRaw: string,
  ) {
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    return this.washService.getWasherMonthlyCompletedCount(req.user, washerId, year, month);
  }

  @Get('admin/washers/monthly-completed')
  @Roles(UserRole.ADMIN)
  async allWashersMonthlyCompleted(
    @Req() req: any,
    @Query('year') yearRaw: string,
    @Query('month') monthRaw: string,
  ) {
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    return this.washService.getAllWashersMonthlyCompletedCount(req.user, year, month);
  }

  @Get('admin/operations-dashboard')
  @Roles(UserRole.ADMIN)
  async adminOperationsDashboard(@Req() req: any) {
    return this.washService.getAdminOperationsDashboard(req.user);
  }

  // Washer toggles online/offline presence + updates current location for nearby discovery
  @Post('washers/presence')
  @Roles(UserRole.WASHER)
  async presence(@Req() req: any, @Body() dto: WasherPresenceDto) {
    return this.washService.updateWasherPresence(req.user, dto);
  }

  @Get('washers/presence/me')
  @Roles(UserRole.WASHER)
  async myPresence(@Req() req: any) {
    return this.washService.getWasherPresence(req.user);
  }

  // Owner fetches nearby washers for map display (polling)
  @Get('washers/nearby')
  @Roles(UserRole.OWNER)
  async nearby(
    @Req() req: any,
    @Query('lat') latRaw: string,
    @Query('lng') lngRaw: string,
    @Query('radiusKm') radiusRaw?: string,
  ) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    const radiusKm = radiusRaw == null || radiusRaw === '' ? 3 : Number(radiusRaw);

    // Avoid class-validator transform quirks for query strings; validate manually.
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new BadRequestException('lat must be a valid latitude (-90..90)');
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new BadRequestException('lng must be a valid longitude (-180..180)');
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      throw new BadRequestException('radiusKm must be a positive number');
    }

    return this.washService.listNearbyWashers(req.user, lat, lng, radiusKm);
  }
}
