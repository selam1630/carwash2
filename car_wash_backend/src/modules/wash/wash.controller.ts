import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';
import { CreateWashRequestDto } from './dto/create-wash-request.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
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
    this.washGateway.emitRequestCreated(created);
    return created;
  }

  @Get('requests/open')
  @Roles(UserRole.WASHER, UserRole.ADMIN)
  async listOpenRequests() {
    return this.washService.listOpen();
  }

  @Get('requests/active')
  @Roles(UserRole.OWNER)
  async ownerActiveRequest(@Req() req: any) {
    return this.washService.getActiveForOwner(req.user);
  }

  @Post('requests/:id/accept')
  @Roles(UserRole.WASHER)
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

  @Post('requests/:id/complete')
  @Roles(UserRole.OWNER)
  async completeByOwner(@Req() req: any, @Param('id') requestId: string) {
    const completed = await this.washService.completeByOwner(req.user, requestId);
    this.washGateway.emitRequestCompleted(completed);
    return completed;
  }
}
