import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, MoreThan, Repository } from 'typeorm';
import { User, UserRole } from '../users/entities/user.entity';
import { OwnerSubscription } from '../plans/entities/owner-subscription.entity';
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
    @InjectRepository(OwnerSubscription)
    private readonly ownerSubRepo: Repository<OwnerSubscription>,
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
    await this.ensureOwnerHasRemainingWashes(ownerId);

    const existing = await this.washRepo.findOne({
      where: [
        { ownerId, status: WashRequestStatus.REQUESTED },
        { ownerId, status: WashRequestStatus.ACCEPTED },
        { ownerId, status: WashRequestStatus.PENDING_OWNER_CONFIRMATION },
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

  async listOpenForUser(user: AuthUser, radiusKm = 5) {
    const role = String(user.role).toUpperCase();
    if (role === UserRole.ADMIN) {
      return this.listOpen();
    }
    if (role !== UserRole.WASHER) {
      throw new ForbiddenException('Only washers/admin can view open requests');
    }

    const washerId = this.getUserId(user);
    const meta = await this.redis.get(`wash:washer:${washerId}:presence`);
    if (!meta) {
      // Washer must be online/present to receive nearby jobs.
      return [];
    }

    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const parsed = JSON.parse(meta) as { lat?: number; lng?: number };
      lat = Number(parsed.lat);
      lng = Number(parsed.lng);
    } catch (_) {
      return [];
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return [];
    }

    const open = await this.washRepo.find({
      where: { status: WashRequestStatus.REQUESTED },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    return open.filter((r) => {
      const d = this.haversineKm(lat as number, lng as number, r.pickupLat, r.pickupLng);
      return d <= radiusKm;
    });
  }

  async getActiveForOwner(ownerUser: AuthUser) {
    await this.ensureOwner(ownerUser);
    const ownerId = this.getUserId(ownerUser);

    return this.washRepo.findOne({
      where: [
        { ownerId, status: WashRequestStatus.REQUESTED },
        { ownerId, status: WashRequestStatus.ACCEPTED },
        { ownerId, status: WashRequestStatus.PENDING_OWNER_CONFIRMATION },
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

    await this.consumeOwnerWash(ownerId);
    request.status = WashRequestStatus.COMPLETED;
    request.updatedAt = new Date();

    return this.washRepo.save(request);
  }

  async submitCompletionByWasher(
    washerUser: AuthUser,
    requestId: string,
    afterWashPhotoPath: string,
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
      throw new BadRequestException('Only accepted requests can be submitted for owner confirmation');
    }

    request.status = WashRequestStatus.PENDING_OWNER_CONFIRMATION;
    request.afterWashPhoto = afterWashPhotoPath;
    request.washerSubmittedAt = new Date();
    request.updatedAt = new Date();
    return this.washRepo.save(request);
  }

  async ownerConfirmCompletion(
    ownerUser: AuthUser,
    requestId: string,
    approved: boolean,
  ) {
    await this.ensureOwner(ownerUser);
    const ownerId = this.getUserId(ownerUser);

    const request = await this.washRepo.findOne({ where: { id: requestId } });
    if (!request) {
      throw new NotFoundException('Wash request not found');
    }
    if (request.ownerId !== ownerId) {
      throw new ForbiddenException('You can confirm only your own request');
    }
    if (request.status !== WashRequestStatus.PENDING_OWNER_CONFIRMATION) {
      throw new BadRequestException('Request is not waiting for owner confirmation');
    }

    if (approved) {
      await this.consumeOwnerWash(ownerId);
      request.status = WashRequestStatus.COMPLETED;
      request.ownerConfirmedAt = new Date();
      request.updatedAt = new Date();
      return this.washRepo.save(request);
    }

    // Owner rejected completion -> reopen request for other nearby washers
    request.status = WashRequestStatus.REQUESTED;
    request.washerId = null;
    request.washer = null;
    request.washerLat = null;
    request.washerLng = null;
    request.washerLocationUpdatedAt = null;
    request.reopenedCount = (request.reopenedCount ?? 0) + 1;
    request.lastReopenedAt = new Date();
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
    // Keep online state until biker explicitly turns offline.
    await this.redis.set(
      metaKey,
      JSON.stringify({ lat: dto.lat, lng: dto.lng, updatedAt: new Date().toISOString() }),
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

  async getWasherMonthlyCompletedCount(
    requester: AuthUser,
    washerId: string,
    year: number,
    month: number,
  ) {
    const role = String(requester.role).toUpperCase();
    const requesterId = this.getUserId(requester);
    if (role !== UserRole.ADMIN && requesterId !== washerId) {
      throw new ForbiddenException('Only admin or the same washer can view this count');
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('year/month are required and month must be 1..12');
    }

    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 1, 0, 0, 0));

    const count = await this.washRepo.count({
      where: {
        washerId,
        status: WashRequestStatus.COMPLETED,
        ownerConfirmedAt: Between(from, to),
      },
    });

    return {
      washerId,
      year,
      month,
      completedCount: count,
    };
  }

  async getAllWashersMonthlyCompletedCount(
    requester: AuthUser,
    year: number,
    month: number,
  ) {
    const role = String(requester.role).toUpperCase();
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can view all washer monthly counts');
    }
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('year/month are required and month must be 1..12');
    }

    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 1, 0, 0, 0));

    const washers = await this.usersRepo.find({
      where: { role: UserRole.WASHER },
      order: { createdAt: 'ASC' },
      relations: ['washerProfile'],
    });

    const items = await Promise.all(
      washers.map(async (w) => {
        const completedCount = await this.washRepo.count({
          where: {
            washerId: w.id,
            status: WashRequestStatus.COMPLETED,
            ownerConfirmedAt: Between(from, to),
          },
        });

        return {
          washerId: w.id,
          phone: w.phone,
          fullName: (w as any).washerProfile?.fullName ?? null,
          completedCount,
        };
      }),
    );

    return {
      year,
      month,
      totalWashers: items.length,
      items,
    };
  }

  async getNearbyOnlineWasherIds(lat: number, lng: number, radiusKm = 5) {
    const results = (await this.redis.georadius(
      this.washersGeoKey,
      lng,
      lat,
      radiusKm,
      'km',
    )) as string[];

    const onlineIds: string[] = [];
    for (const washerId of results) {
      const meta = await this.redis.get(`wash:washer:${washerId}:presence`);
      if (meta) {
        onlineIds.push(washerId);
      } else {
        await this.redis.zrem(this.washersGeoKey, washerId);
      }
    }
    return onlineIds;
  }

  async getAdminOperationsDashboard(requester: AuthUser) {
    const role = String(requester.role).toUpperCase();
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can view operations dashboard');
    }

    const activeWashRequests = await this.washRepo.find({
      where: {
        status: In([WashRequestStatus.REQUESTED, WashRequestStatus.ACCEPTED]),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });

    const waitingOwnerConfirmations = await this.washRepo.find({
      where: {
        status: WashRequestStatus.PENDING_OWNER_CONFIRMATION,
      },
      order: { washerSubmittedAt: 'DESC' },
      take: 100,
    });

    const reopenedJobs = await this.washRepo.find({
      where: {
        reopenedCount: MoreThan(0),
      },
      order: { lastReopenedAt: 'DESC' },
      take: 100,
    });

    const failedJobs = await this.washRepo.find({
      where: {
        status: WashRequestStatus.CANCELLED,
      },
      order: { updatedAt: 'DESC' },
      take: 100,
    });

    const washers = await this.usersRepo.find({
      where: { role: UserRole.WASHER },
      relations: ['washerProfile'],
      order: { createdAt: 'ASC' },
    });

    const onlineIdsRaw = await this.redis.zrange(this.washersGeoKey, 0, -1);
    const onlineIds: string[] = [];
    const onlineSet = new Set<string>();

    for (const washerId of onlineIdsRaw) {
      const meta = await this.redis.get(`wash:washer:${washerId}:presence`);
      if (meta) {
        onlineIds.push(washerId);
        onlineSet.add(washerId);
      } else {
        await this.redis.zrem(this.washersGeoKey, washerId);
      }
    }

    const onlineBikers = washers
      .filter((w) => onlineSet.has(w.id))
      .map((w) => ({
        washerId: w.id,
        phone: w.phone,
        fullName: (w as any).washerProfile?.fullName ?? null,
        isActive: w.isActive,
      }));

    const offlineBikers = washers
      .filter((w) => !onlineSet.has(w.id))
      .map((w) => ({
        washerId: w.id,
        phone: w.phone,
        fullName: (w as any).washerProfile?.fullName ?? null,
        isActive: w.isActive,
      }));

    return {
      generatedAt: new Date().toISOString(),
      activeWashRequests,
      waitingOwnerConfirmations,
      onlineBikers,
      offlineBikers,
      reopenedJobs,
      failedJobs,
      summary: {
        activeWashRequests: activeWashRequests.length,
        waitingOwnerConfirmations: waitingOwnerConfirmations.length,
        onlineBikers: onlineBikers.length,
        offlineBikers: offlineBikers.length,
        reopenedJobs: reopenedJobs.length,
        failedJobs: failedJobs.length,
      },
    };
  }

  private async ensureOwner(user: AuthUser) {
    const role = String(user.role).toUpperCase();
    if (role !== UserRole.OWNER) {
      throw new ForbiddenException('Only owners can do this action');
    }
  }

  private async getActiveOwnerSubscription(ownerUserId: string) {
    return this.ownerSubRepo.findOne({
      where: {
        ownerProfile: { user: { id: ownerUserId } },
        expiresAt: MoreThan(new Date()),
      },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });
  }

  private isUnlimitedPlan(sub: OwnerSubscription) {
    const washesPerMonth = Number(sub.plan?.washesPerMonth ?? 0);
    if (washesPerMonth <= 0) return true;
    const name = String(sub.plan?.name ?? '').toLowerCase();
    return name.includes('unlimited');
  }

  private async ensureOwnerHasRemainingWashes(ownerUserId: string) {
    const sub = await this.getActiveOwnerSubscription(ownerUserId);
    if (!sub) {
      throw new ForbiddenException('No active package. Please subscribe again.');
    }
    if (this.isUnlimitedPlan(sub)) return;

    const washesAllowed = Number(sub.plan.washesPerMonth);
    const washesUsed = Number(sub.washesUsed ?? 0);
    if (washesUsed >= washesAllowed) {
      throw new ForbiddenException('Package finished. Please subscribe again.');
    }
  }

  private async consumeOwnerWash(ownerUserId: string) {
    const sub = await this.getActiveOwnerSubscription(ownerUserId);
    if (!sub) {
      throw new ForbiddenException('No active package. Please subscribe again.');
    }
    if (this.isUnlimitedPlan(sub)) return;

    const washesAllowed = Number(sub.plan.washesPerMonth);
    const washesUsed = Number(sub.washesUsed ?? 0);
    if (washesUsed >= washesAllowed) {
      throw new ForbiddenException('Package finished. Please subscribe again.');
    }

    sub.washesUsed = washesUsed + 1;
    await this.ownerSubRepo.save(sub);
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

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const r = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return r * c;
  }
}
