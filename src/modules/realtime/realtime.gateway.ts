import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

// ─── Event Types (mirrors CopEventType from the frontend) ────────────────────
export enum CopEventType {
  // Occurrences
  OCCURRENCE_CREATED = 'occurrence:created',
  OCCURRENCE_UPDATED = 'occurrence:updated',
  OCCURRENCE_STATUS_CHANGED = 'occurrence:status_changed',
  OCCURRENCE_ASSIGNED = 'occurrence:assigned',
  OCCURRENCE_RESOLVED = 'occurrence:resolved',
  OCCURRENCE_CLOSED = 'occurrence:closed',

  // Alerts
  ALERT_CREATED = 'alert:created',
  ALERT_ACKNOWLEDGED = 'alert:acknowledged',
  ALERT_RESOLVED = 'alert:resolved',

  // War Room
  WAR_ROOM_OPENED = 'warroom:opened',
  WAR_ROOM_MESSAGE = 'warroom:message',
  WAR_ROOM_DECISION = 'warroom:decision',
  WAR_ROOM_CLOSED = 'warroom:closed',

  // KPIs
  KPI_UPDATE = 'kpi:update',

  // System
  USER_JOINED = 'user:joined',
  USER_LEFT = 'user:left',
  PING = 'ping',
  PONG = 'pong',
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  terminalId?: string;
  organizationId?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:8080', 'http://localhost:3000', 'http://localhost:5173'],
    credentials: true,
  },
  namespace: '/',
  transports: ['websocket', 'polling'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private connectedClients = new Map<string, { userId: string; terminalId?: string; connectedAt: Date }>();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  afterInit(server: Server) {
    this.logger.log('WebSocket Gateway initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      client.userId = payload.sub;
      client.userRole = payload.role;
      client.terminalId = payload.terminalId;
      client.organizationId = payload.organizationId;

      // Join rooms: terminal room + organization room
      if (client.terminalId) {
        await client.join(`terminal:${client.terminalId}`);
      }
      await client.join(`org:${client.organizationId}`);
      await client.join(`user:${client.userId}`);

      this.connectedClients.set(client.id, {
        userId: client.userId,
        terminalId: client.terminalId,
        connectedAt: new Date(),
      });

      this.logger.log(`Client ${client.id} connected (user: ${payload.email}, terminal: ${client.terminalId})`);

      // Notify terminal about new user
      if (client.terminalId) {
        this.server.to(`terminal:${client.terminalId}`).emit(CopEventType.USER_JOINED, {
          userId: client.userId,
          terminalId: client.terminalId,
          connectedAt: new Date(),
        });
      }
    } catch (error) {
      this.logger.warn(`Client ${client.id} authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    this.connectedClients.delete(client.id);

    if (client.terminalId) {
      this.server.to(`terminal:${client.terminalId}`).emit(CopEventType.USER_LEFT, {
        userId: client.userId,
        terminalId: client.terminalId,
      });
    }

    this.logger.log(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage(CopEventType.PING)
  handlePing(@ConnectedSocket() client: AuthenticatedSocket) {
    client.emit(CopEventType.PONG, { timestamp: new Date() });
  }

  @SubscribeMessage('join:warroom')
  async handleJoinWarRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { warRoomId: string },
  ) {
    await client.join(`warroom:${data.warRoomId}`);
    this.logger.log(`Client ${client.id} joined war room ${data.warRoomId}`);
    return { joined: true, warRoomId: data.warRoomId };
  }

  @SubscribeMessage('leave:warroom')
  async handleLeaveWarRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { warRoomId: string },
  ) {
    await client.leave(`warroom:${data.warRoomId}`);
    return { left: true, warRoomId: data.warRoomId };
  }

  // ─── Emission helpers (called by services) ─────────────────────────────────

  emitToTerminal(terminalId: string, event: CopEventType, data: any) {
    this.server.to(`terminal:${terminalId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  emitToOrganization(organizationId: string, event: CopEventType, data: any) {
    this.server.to(`org:${organizationId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  emitToWarRoom(warRoomId: string, event: CopEventType, data: any) {
    this.server.to(`warroom:${warRoomId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  emitToUser(userId: string, event: CopEventType, data: any) {
    this.server.to(`user:${userId}`).emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  getConnectedCount(terminalId?: string): number {
    if (!terminalId) return this.connectedClients.size;
    return Array.from(this.connectedClients.values()).filter(
      (c) => c.terminalId === terminalId,
    ).length;
  }
}
