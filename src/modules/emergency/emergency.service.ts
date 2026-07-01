import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OccurrenceStatus, TimelineEventType, UserRole } from '@prisma/client';
import {
  CreateOccurrenceDto,
  UpdateOccurrenceDto,
  UpdateOccurrenceStatusDto,
  OccurrenceQueryDto,
} from './dto/occurrence.dto';

@Injectable()
export class EmergencyService {
  private readonly logger = new Logger(EmergencyService.name);
  private occurrenceCounter = 0;

  constructor(private prisma: PrismaService) {}

  async findAll(query: OccurrenceQueryDto, user: any) {
    const { status, severity, type, terminalId, search, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { isActive: true };

    // Tenant isolation: non-admins see only their terminal
    if (user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.ADMIN) {
      where.terminalId = user.terminalId;
    } else if (terminalId && terminalId !== 'all') {
      where.terminalId = terminalId;
    }

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (type) where.type = type;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.occurrence.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          terminal: { select: { id: true, name: true } },
          emergencyType: { select: { id: true, name: true } },
          reportedBy: { select: { id: true, name: true } },
          assignedTo: { select: { id: true, name: true } },
          _count: { select: { alerts: true, warRooms: true, evidences: true } },
        },
      }),
      this.prisma.occurrence.count({ where }),
    ]);

    return {
      data: items.map(this.formatOccurrence),
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    };
  }

  async findOne(id: string, user: any) {
    const occurrence = await this.prisma.occurrence.findUnique({
      where: { id },
      include: {
        terminal: { select: { id: true, name: true } },
        emergencyType: { select: { id: true, name: true } },
        reportedBy: { select: { id: true, name: true, avatarUrl: true } },
        assignedTo: { select: { id: true, name: true, avatarUrl: true } },
        timeline: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true } } },
        },
        evidences: { orderBy: { createdAt: 'desc' } },
        checklist: { orderBy: { order: 'asc' } },
        alerts: { where: { status: 'ACTIVE' }, take: 5 },
        warRooms: { where: { status: 'ACTIVE' }, take: 1 },
        _count: { select: { alerts: true, warRooms: true, evidences: true } },
      },
    });

    if (!occurrence) throw new NotFoundException(`Ocorrência ${id} não encontrada`);
    this.checkTenantAccess(occurrence, user);

    return this.formatOccurrenceDetail(occurrence);
  }

  async create(dto: CreateOccurrenceDto, user: any) {
    const terminalId = dto.terminalId || user.terminalId;
    if (!terminalId) throw new ForbiddenException('Terminal não identificado');

    const code = await this.generateCode();

    const occurrence = await this.prisma.occurrence.create({
      data: {
        code,
        terminalId,
        title: dto.title,
        description: dto.description,
        type: dto.type || 'OPERATIONAL',
        severity: dto.severity || 'MEDIUM',
        criticality: dto.criticality || 'URGENT',
        status: 'OPEN',
        location: dto.location,
        latitude: dto.latitude,
        longitude: dto.longitude,
        emergencyTypeId: dto.emergencyTypeId,
        reportedByUserId: user.id,
        assignedToUserId: dto.assignedToUserId,
        slaDeadline: this.calculateSlaDeadline(dto.criticality || 'URGENT'),
        timeline: {
          create: {
            userId: user.id,
            eventType: TimelineEventType.CREATED,
            description: `Ocorrência criada por ${user.name}`,
          },
        },
      },
      include: {
        terminal: { select: { id: true, name: true } },
        reportedBy: { select: { id: true, name: true } },
      },
    });

    this.logger.log(`Occurrence ${occurrence.code} created by ${user.email}`);
    return this.formatOccurrence(occurrence as any);
  }

  async update(id: string, dto: UpdateOccurrenceDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    this.checkTenantAccess(occurrence, user);

    const updated = await this.prisma.occurrence.update({
      where: { id },
      data: {
        ...dto,
        updatedAt: new Date(),
        timeline: {
          create: {
            userId: user.id,
            eventType: TimelineEventType.COMMENT,
            description: `Ocorrência atualizada por ${user.name}`,
          },
        },
      },
      include: {
        terminal: { select: { id: true, name: true } },
        reportedBy: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    });

    return this.formatOccurrence(updated as any);
  }

  async updateStatus(id: string, dto: UpdateOccurrenceStatusDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    this.checkTenantAccess(occurrence, user);

    const data: any = { status: dto.status, updatedAt: new Date() };
    if (dto.status === 'RESOLVED') data.resolvedAt = new Date();
    if (dto.status === 'CLOSED') data.closedAt = new Date();

    const updated = await this.prisma.occurrence.update({
      where: { id },
      data: {
        ...data,
        timeline: {
          create: {
            userId: user.id,
            eventType: TimelineEventType.STATUS_CHANGED,
            description: dto.comment || `Status alterado para ${dto.status} por ${user.name}`,
            metadata: { previousStatus: occurrence.status, newStatus: dto.status },
          },
        },
      },
    });

    return updated;
  }

  async remove(id: string, user: any) {
    const occurrence = await this.findOneRaw(id);
    this.checkTenantAccess(occurrence, user);

    await this.prisma.occurrence.update({
      where: { id },
      data: { isActive: false },
    });

    return { message: 'Ocorrência removida com sucesso' };
  }

  private async findOneRaw(id: string) {
    const occurrence = await this.prisma.occurrence.findUnique({ where: { id } });
    if (!occurrence) throw new NotFoundException(`Ocorrência ${id} não encontrada`);
    return occurrence;
  }

  private checkTenantAccess(occurrence: any, user: any) {
    if (user.role === UserRole.SUPER_ADMIN || user.role === UserRole.ADMIN) return;
    if (occurrence.terminalId !== user.terminalId) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }
  }

  private async generateCode(): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.occurrence.count({
      where: { code: { startsWith: `OCC-${year}-` } },
    });
    return `OCC-${year}-${String(count + 1).padStart(4, '0')}`;
  }

  private calculateSlaDeadline(criticality: string): Date {
    const slaHours: Record<string, number> = {
      CRISIS: 1, EMERGENCY: 4, URGENT: 24, ROUTINE: 72,
    };
    const hours = slaHours[criticality] ?? 24;
    const deadline = new Date();
    deadline.setHours(deadline.getHours() + hours);
    return deadline;
  }

  private formatOccurrence(o: any) {
    return {
      id: o.id,
      code: o.code,
      title: o.title,
      description: o.description,
      type: o.type,
      severity: o.severity,
      criticality: o.criticality,
      status: o.status,
      location: o.location,
      terminalId: o.terminalId,
      terminalName: o.terminal?.name,
      emergencyTypeId: o.emergencyTypeId,
      emergencyTypeName: o.emergencyType?.name,
      reportedByUserId: o.reportedByUserId,
      reportedByUserName: o.reportedBy?.name,
      assignedToUserId: o.assignedToUserId,
      assignedToUserName: o.assignedTo?.name,
      alertCount: o._count?.alerts ?? 0,
      participantCount: o._count?.warRooms ?? 0,
      evidenceCount: o._count?.evidences ?? 0,
      slaDeadline: o.slaDeadline,
      isActive: o.isActive,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      resolvedAt: o.resolvedAt,
      closedAt: o.closedAt,
    };
  }

  private formatOccurrenceDetail(o: any) {
    return {
      ...this.formatOccurrence(o),
      timeline: o.timeline?.map((t: any) => ({
        id: t.id,
        eventType: t.eventType,
        description: t.description,
        metadata: t.metadata,
        userId: t.userId,
        userName: t.user?.name,
        createdAt: t.createdAt,
      })),
      evidences: o.evidences,
      checklist: o.checklist,
      activeAlerts: o.alerts,
      activeWarRoom: o.warRooms?.[0] ?? null,
    };
  }
}
