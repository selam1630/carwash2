import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateWashRequestDto } from './dto/create-wash-request.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { WashRequest, WashRequestStatus } from './entities/wash-request.entity';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';

type AuthUser = { id?: string; sub?: string; role: UserRole };

@Injectable()
export class WashService {
  private readonly washersGeoKey = 'wash:online:washers';
  private readonly logger = new Logger(WashService.name);

  constructor(
    @InjectRepository(WashRequest)
    private readonly washRepo: Repository<WashRequest>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRedis()
    private readonly redis: Redis,
  ) {
    this.redis.on('error', (err) =>
      this.logger.warn('Redis connection error: ' + err.message),
    );
  }

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
    await this.ensureWasherOrAdmin(washerUser);
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

  async updateWasherPresence(washerUser: AuthUser, dto: { lat: number; lng: number; online?: boolean }) {
    await this.ensureWasher(washerUser);
    const washerId = this.getUserId(washerUser);

    const online = dto.online ?? true;
    const metaKey = `wash:washer:${washerId}:presence`;

    if (!online) {
      await this.redis.zrem(this.washersGeoKey, washerId);
      await this.redis.del(metaKey);
      return { ok: true, online: false };
    }

    // GEOADD key lng lat member
    await this.redis.geoadd(this.washersGeoKey, dto.lng, dto.lat, washerId);
    await this.redis.set(
      metaKey,
      JSON.stringify({ lat: dto.lat, lng: dto.lng, updatedAt: new Date().toISOString() }),
      'EX',
      30,
    );
    return { ok: true, online: true };
  }

  async listNearbyWashers(ownerUser: AuthUser, lat: number, lng: number, radiusKm = 3) {
    await this.ensureOwner(ownerUser);

    // GEORADIUS key lng lat radius km WITHCOORD
    const results = (await this.redis.georadius(
      this.washersGeoKey,
      lng,
      lat,
      radiusKm,
      'km',
      'WITHCOORD',
    )) as Array<[string, [string, string]]>;

    const items: Array<{ washerId: string; lat: number; lng: number }> = [];
    for (const row of results) {
      const washerId = row[0];
      const coords = row[1];
      if (!coords || coords.length < 2) continue;
      const wLng = Number(coords[0]);
      const wLat = Number(coords[1]);
      if (!Number.isFinite(wLat) || !Number.isFinite(wLng)) continue;
      items.push({ washerId, lat: wLat, lng: wLng });
    }

    return items;
  }

  private async ensureOwner(user: AuthUser) {
    const role = String(user.role).toUpperCase();
    if (role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can do this action');
    }
  }

  private async ensureWasher(user: AuthUser) {
    const role = String(user.role).toUpperCase();
    if (role !== UserRole.WASHER) {
      throw new ForbiddenException('Only washers can do this action');
    }
  }

  private async ensureWasherOrAdmin(user: AuthUser) {
    const role = String(user.role).toUpperCase();
    if (role !== UserRole.WASHER && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only washers/admin can do this action');
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
