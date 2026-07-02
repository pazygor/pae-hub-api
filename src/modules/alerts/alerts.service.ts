import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertStatus, AlertSeverity, AlertType } from '@prisma/client';

export interface CreateAlertDto {
  title: string;
  message: string;
  type?: AlertType;
  severity?: AlertSeverity;
  occurrenceId?: string;
  terminalId?: string;
  source?: string;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export interface AlertQueryDto {
  status?: AlertStatus;
  severity?: AlertSeverity;
  type?: AlertType;
  terminalId?: string;
  occurrenceId?: string;
  page?: number;
  limit?: number;
}

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: AlertQueryDto, user: any) {
    const { status, severity, type, terminalId, occurrenceId, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};

    if (user.role !== 'admin') {
      where.terminalId = user.terminalId;
    } else if (terminalId && terminalId !== 'all') {
      where.terminalId = terminalId;
    }

    if (status) where.status = status;
    if (severity) where.severity = severity;
    if (type) where.type = type;
    if (occurrenceId) where.occurrenceId = occurrenceId;

    const [items, total] = await Promise.all([
      this.prisma.alert.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        include: {
          terminal: { select: { id: true, name: true } },
          occurrence: { select: { id: true, code: true, title: true } },
          acknowledgedBy: { select: { id: true, name: true } },
          resolvedBy: { select: { id: true, name: true } },
        },
      }),
      this.prisma.alert.count({ where }),
    ]);

    return {
      data: items,
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    };
  }

  async findOne(id: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id },
      include: {
        terminal: { select: { id: true, name: true } },
        occurrence: { select: { id: true, code: true, title: true } },
        acknowledgedBy: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
      },
    });
    if (!alert) throw new NotFoundException(`Alerta ${id} não encontrado`);
    return alert;
  }

  async create(dto: CreateAlertDto, user: any) {
    const terminalId = dto.terminalId || user.terminalId;

    const alert = await this.prisma.alert.create({
      data: {
        terminalId,
        title: dto.title,
        message: dto.message,
        type: dto.type || AlertType.OPERATIONAL,
        severity: dto.severity || AlertSeverity.MEDIUM,
        status: AlertStatus.ACTIVE,
        occurrenceId: dto.occurrenceId,
        source: dto.source || 'manual',
        expiresAt: dto.expiresAt,
        metadata: dto.metadata,
      },
    });

    this.logger.log(`Alert created: ${alert.id} (${alert.severity})`);
    return alert;
  }

  async acknowledge(id: string, user: any) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException(`Alerta ${id} não encontrado`);

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedById: user.id,
        acknowledgedAt: new Date(),
      },
    });

    this.logger.log(`Alert ${id} acknowledged by ${user.email}`);
    return updated;
  }

  async resolve(id: string, user: any) {
    const alert = await this.prisma.alert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException(`Alerta ${id} não encontrado`);

    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });

    this.logger.log(`Alert ${id} resolved by ${user.email}`);
    return updated;
  }

  async getActiveCount(terminalId?: string): Promise<number> {
    return this.prisma.alert.count({
      where: {
        status: AlertStatus.ACTIVE,
        ...(terminalId ? { terminalId } : {}),
      },
    });
  }
}
