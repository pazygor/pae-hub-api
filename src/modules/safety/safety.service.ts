import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SafetyItemType, SafetyItemStatus } from '@prisma/client';

@Injectable()
export class SafetyService {
  private readonly logger = new Logger(SafetyService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: { type?: SafetyItemType; status?: SafetyItemStatus; terminalId?: string; page?: number; limit?: number }, user: any) {
    const { type, status, terminalId, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (terminalId) where.terminalId = terminalId;
    else if (user.terminalId) where.terminalId = user.terminalId;
    if (type) where.type = type;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.safetyItem.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          assignedTo: { select: { id: true, name: true } },
        },
      }),
      this.prisma.safetyItem.count({ where }),
    ]);

    return { data: items, meta: { total, page: Number(page), limit: Number(limit) } };
  }

  async findOne(id: string) {
    const item = await this.prisma.safetyItem.findUnique({
      where: { id },
      include: { assignedTo: { select: { id: true, name: true } } },
    });
    if (!item) throw new NotFoundException(`Item de segurança ${id} não encontrado`);
    return item;
  }

  async create(dto: {
    type: SafetyItemType;
    title: string;
    description?: string;
    assignedToId?: string;
    dueDate?: Date;
    metadata?: any;
  }, user: any) {
    const item = await this.prisma.safetyItem.create({
      data: {
        type: dto.type,
        title: dto.title,
        description: dto.description,
        status: SafetyItemStatus.PENDING,
        assignedToId: dto.assignedToId,
        terminalId: user.terminalId,
        dueDate: dto.dueDate,
        metadata: dto.metadata,
      },
    });
    this.logger.log(`Safety item ${item.id} created`);
    return item;
  }

  async update(id: string, dto: Partial<{
    title: string;
    description: string;
    status: SafetyItemStatus;
    assignedToId: string;
    dueDate: Date;
  }>, user: any) {
    const item = await this.prisma.safetyItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Item ${id} não encontrado`);

    const data: any = { ...dto };
    if (dto.status === SafetyItemStatus.COMPLETED) {
      data.completedAt = new Date();
    }

    return this.prisma.safetyItem.update({ where: { id }, data });
  }

  async getSummary(terminalId?: string) {
    const where: any = {};
    if (terminalId) where.terminalId = terminalId;

    const [total, byStatus, overdue] = await Promise.all([
      this.prisma.safetyItem.count({ where }),
      this.prisma.safetyItem.groupBy({ by: ['status'], where, _count: true }),
      this.prisma.safetyItem.count({
        where: { ...where, status: { not: SafetyItemStatus.COMPLETED }, dueDate: { lt: new Date() } },
      }),
    ]);

    return {
      total,
      overdue,
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
    };
  }
}
