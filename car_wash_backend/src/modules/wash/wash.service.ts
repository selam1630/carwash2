import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateWashRequestDto } from './dto/create-wash-request.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { WashRequest, WashRequestStatus } from './entities/wash-request.entity';

type AuthUser = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class WashService {
  constructor(
    @InjectRepository(WashRequest)
    private readonly washRepo: Repository<WashRequest>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async create(ownerUser: AuthUser, dto: CreateWashRequestDto) {
    await this.ensureOwner(ownerUser);
    const ownerId = this.getUserId(ownerUser);

    const existing = await this.washRepo.findOne({
      where: [
        { ownerId, status: WashRequestStatus.REQUESTED },
        { ownerId, status: WashRequestStatus.ACCEPTED },
      ],
      order: { createdAt: 'DESC' },
    });
    if (existing) {
      throw new BadRequestException('You already have an active wash request');
    }

    const owner = await this.usersRepo.findOne({ where: { id: ownerId } });
    if (!owner) {
      throw new NotFoundException('Owner not found');
    }

    const request = this.washRepo.create({
      owner,
      ownerId: owner.id,
      status: WashRequestStatus.REQUESTED,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      washer: null,
      washerId: null,
      washerLat: null,
      washerLng: null,
      washerLocationUpdatedAt: null,
    });

    return this.washRepo.save(request);
  }

  async listOpen() {
    return this.washRepo.find({
      where: { status: WashRequestStatus.REQUESTED },
      order: { createdAt: 'ASC' },
      take: 50,
    });
  }

  async getActiveForOwner(ownerUser: AuthUser) {
    await this.ensureOwner(ownerUser);
    const ownerId = this.getUserId(ownerUser);

    return this.washRepo.findOne({
      where: [
        { ownerId, status: WashRequestStatus.REQUESTED },
        { ownerId, status: WashRequestStatus.ACCEPTED },
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async accept(washerUser: AuthUser, requestId: string) {
    await this.ensureWasher(washerUser);
    const washerId = this.getUserId(washerUser);

    const request = await this.washRepo.findOne({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Wash request not found');
    }
    if (request.status !== WashRequestStatus.REQUESTED) {
      throw new BadRequestException('Request already taken or closed');
    }

    request.status = WashRequestStatus.ACCEPTED;
    request.washerId = washerId;
    request.washer = await this.usersRepo.findOne({ where: { id: washerId } });
    request.updatedAt = new Date();

    return this.washRepo.save(request);
  }

  async completeByOwner(ownerUser: AuthUser, requestId: string) {
    await this.ensureOwner(ownerUser);
    const ownerId = this.getUserId(ownerUser);

    const request = await this.washRepo.findOne({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Wash request not found');
    }
    if (request.ownerId !== ownerId) {
      throw new ForbiddenException('You can complete only your own request');
    }
    if (request.status !== WashRequestStatus.ACCEPTED) {
      throw new BadRequestException('Only accepted requests can be completed');
    }

    request.status = WashRequestStatus.COMPLETED;
    request.updatedAt = new Date();

    return this.washRepo.save(request);
  }

  async updateWasherLocation(
    washerUser: AuthUser,
    requestId: string,
    dto: UpdateLocationDto,
  ) {
    await this.ensureWasher(washerUser);
    const washerId = this.getUserId(washerUser);

    const request = await this.washRepo.findOne({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Wash request not found');
    }
    if (request.washerId !== washerId) {
      throw new ForbiddenException('You are not assigned to this request');
    }
    if (request.status !== WashRequestStatus.ACCEPTED) {
      throw new BadRequestException('Request is not active');
    }

    request.washerLat = dto.lat;
    request.washerLng = dto.lng;
    request.washerLocationUpdatedAt = new Date();
    request.updatedAt = new Date();
    await this.washRepo.save(request);

    return {
      requestId: request.id,
      ownerId: request.ownerId,
      washerId: request.washerId,
      lat: dto.lat,
      lng: dto.lng,
      heading: dto.heading ?? null,
      speed: dto.speed ?? null,
      timestamp: request.washerLocationUpdatedAt.toISOString(),
    };
  }

  async canJoinRequestRoom(user: AuthUser, requestId: string) {
    const request = await this.washRepo.findOne({ where: { id: requestId } });
    if (!request) {
      return false;
    }
    const userId = this.getUserId(user);
    return request.ownerId === userId || request.washerId === userId || user.role === UserRole.ADMIN;
  }

  private async ensureOwner(user: AuthUser) {
    if (user.role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can do this action');
    }
  }

  private async ensureWasher(user: AuthUser) {
    if (user.role !== UserRole.WASHER) {
      throw new ForbiddenException('Only washers can do this action');
    }
  }

  private getUserId(user: AuthUser): string {
    const id = user.id ?? user.sub;
    if (!id) {
      throw new ForbiddenException('Invalid authenticated user');
    }
    return id;
  }
}
