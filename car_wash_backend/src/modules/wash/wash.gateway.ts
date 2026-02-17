import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../users/entities/user.entity';
import { UpdateLocationDto } from './dto/update-location.dto';
import { WashService } from './wash.service';
import { WashRequest } from './entities/wash-request.entity';

type SocketUser = { sub: string; role: UserRole };

type WasherLocationPayload = {
  requestId: string;
  ownerId: string;
  washerId: string | null;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  timestamp: string;
};

type OwnerLocationPayload = {
  requestId: string;
  ownerId: string;
  lat: number;
  lng: number;
  timestamp: string;
};

@WebSocketGateway({
  namespace: '/wash',
  cors: { origin: true, credentials: true },
})
export class WashGateway implements OnGatewayConnection {
  private readonly logger = new Logger(WashGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly washService: WashService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new UnauthorizedException('Missing auth token');
      }
      const payload = this.jwtService.verify<SocketUser>(token, {
        secret: this.configService.get<string>('jwt.accessSecret'),
      });
      client.data.user = payload;
      client.join(this.userRoom(payload.sub));
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${error instanceof Error ? error.message : String(error)}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('request:join')
  async joinRequestRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { requestId: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.requestId) return;

    const allowed = await this.washService.canJoinRequestRoom(user, body.requestId);
    if (!allowed) {
      client.emit('request:error', { message: 'Not allowed to join this request room' });
      return;
    }

    client.join(this.requestRoom(body.requestId));
    client.emit('request:joined', { requestId: body.requestId });
  }

  @SubscribeMessage('washer:location')
  async onWasherLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: UpdateLocationDto & { requestId: string },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.requestId) return;

    try {
      const payload = await this.washService.updateWasherLocation(user, body.requestId, {
        lat: body.lat,
        lng: body.lng,
        heading: body.heading,
        speed: body.speed,
      });
      this.emitWasherLocation(payload);
    } catch (error) {
      client.emit('request:error', {
        message: error instanceof Error ? error.message : 'Failed to update location',
      });
    }
  }

  @SubscribeMessage('owner:location')
  async onOwnerLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { requestId: string; lat: number; lng: number },
  ) {
    const user = client.data.user as SocketUser | undefined;
    if (!user || !body?.requestId) return;

    const allowed = await this.washService.canJoinRequestRoom(user, body.requestId);
    if (!allowed) {
      client.emit('request:error', { message: 'Not allowed to send owner location for this request' });
      return;
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const payload: OwnerLocationPayload = {
      requestId: body.requestId,
      ownerId: user.sub,
      lat,
      lng,
      timestamp: new Date().toISOString(),
    };
    this.emitOwnerLocation(payload);
  }

  emitRequestCreated(request: WashRequest) {
    this.server.emit('request:created', {
      requestId: request.id,
      ownerId: request.ownerId,
      pickupLat: request.pickupLat,
      pickupLng: request.pickupLng,
      status: request.status,
      createdAt: request.createdAt,
    });
  }

  emitRequestAccepted(request: WashRequest) {
    const payload = {
      requestId: request.id,
      ownerId: request.ownerId,
      washerId: request.washerId,
      status: request.status,
    };
    this.server.to(this.userRoom(request.ownerId)).emit('request:accepted', payload);
    if (request.washerId) {
      this.server.to(this.userRoom(request.washerId)).emit('request:accepted', payload);
    }
    this.server.to(this.requestRoom(request.id)).emit('request:accepted', payload);
  }

  emitRequestCompleted(request: WashRequest) {
    const payload = {
      requestId: request.id,
      ownerId: request.ownerId,
      washerId: request.washerId,
      status: request.status,
    };

    this.server.to(this.userRoom(request.ownerId)).emit('request:completed', payload);
    if (request.washerId) {
      this.server.to(this.userRoom(request.washerId)).emit('request:completed', payload);
    }
    this.server.to(this.requestRoom(request.id)).emit('request:completed', payload);
  }

  emitWasherLocation(payload: WasherLocationPayload) {
    this.server
      .to(this.userRoom(payload.ownerId))
      .emit('washer:location', payload);
    this.server
      .to(this.requestRoom(payload.requestId))
      .emit('washer:location', payload);
  }

  emitOwnerLocation(payload: OwnerLocationPayload) {
    this.server.to(this.requestRoom(payload.requestId)).emit('owner:location', payload);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private requestRoom(requestId: string) {
    return `request:${requestId}`;
  }

  private extractToken(client: Socket): string | null {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.replace(/^Bearer\s+/i, '').trim();
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.trim()) {
      return header.replace(/^Bearer\s+/i, '').trim();
    }

    return null;
  }
}
