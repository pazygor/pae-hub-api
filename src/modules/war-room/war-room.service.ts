import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { WarRoomStatus } from '@prisma/client';

@Injectable()
export class WarRoomService {
  private readonly logger = new Logger(WarRoomService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: { occurrenceId?: string; status?: WarRoomStatus; page?: number; limit?: number }, user: any) {
    const { occurrenceId, status, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (occurrenceId) where.occurrenceId = occurrenceId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.warRoom.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { openedAt: 'desc' },
        include: {
          occurrence: { select: { id: true, code: true, title: true, severity: true } },
          _count: { select: { participants: true, messages: true, decisions: true } },
        },
      }),
      this.prisma.warRoom.count({ where }),
    ]);

    return {
      data: items.map((wr) => ({
        ...wr,
        participantCount: wr._count.participants,
        messageCount: wr._count.messages,
        decisionCount: wr._count.decisions,
      })),
      meta: { total, page: Number(page), limit: Number(limit) },
    };
  }

  async findOne(id: string) {
    const warRoom = await this.prisma.warRoom.findUnique({
      where: { id },
      include: {
        occurrence: { select: { id: true, code: true, title: true, severity: true, status: true } },
        participants: {
          include: { user: { select: { id: true, name: true, role: true, avatarUrl: true } } },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
        decisions: {
          orderBy: { createdAt: 'asc' },
          include: { user: { select: { id: true, name: true } } },
        },
      },
    });

    if (!warRoom) throw new NotFoundException(`War Room ${id} não encontrada`);
    return warRoom;
  }

  async create(dto: { occurrenceId: string; title?: string }, user: any) {
    const occurrence = await this.prisma.occurrence.findUnique({
      where: { id: dto.occurrenceId },
      select: { id: true, code: true, title: true },
    });
    if (!occurrence) throw new NotFoundException('Ocorrência não encontrada');

    const warRoom = await this.prisma.warRoom.create({
      data: {
        occurrenceId: dto.occurrenceId,
        title: dto.title || `War Room — ${occurrence.code}`,
        status: WarRoomStatus.ACTIVE,
        participants: {
          create: { userId: user.id },
        },
        messages: {
          create: {
            userId: user.id,
            content: `War Room aberta por ${user.name}`,
            isSystem: true,
          },
        },
      },
      include: {
        occurrence: { select: { id: true, code: true, title: true } },
        _count: { select: { participants: true } },
      },
    });

    this.logger.log(`War Room ${warRoom.id} created for occurrence ${occurrence.code}`);
    return warRoom;
  }

  async addMessage(warRoomId: string, content: string, user: any) {
    const warRoom = await this.prisma.warRoom.findUnique({ where: { id: warRoomId } });
    if (!warRoom) throw new NotFoundException('War Room não encontrada');

    // Add participant if not already
    await this.prisma.warRoomParticipant.upsert({
      where: { warRoomId_userId: { warRoomId, userId: user.id } },
      update: {},
      create: { warRoomId, userId: user.id },
    });

    const message = await this.prisma.warRoomMessage.create({
      data: { warRoomId, userId: user.id, content },
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    });

    return message;
  }

  async addDecision(warRoomId: string, description: string, user: any) {
    const warRoom = await this.prisma.warRoom.findUnique({ where: { id: warRoomId } });
    if (!warRoom) throw new NotFoundException('War Room não encontrada');

    const decision = await this.prisma.warRoomDecision.create({
      data: { warRoomId, userId: user.id, description },
      include: { user: { select: { id: true, name: true } } },
    });

    return decision;
  }

  async close(id: string, reason: string, user: any) {
    const warRoom = await this.prisma.warRoom.findUnique({ where: { id } });
    if (!warRoom) throw new NotFoundException('War Room não encontrada');

    const updated = await this.prisma.warRoom.update({
      where: { id },
      data: {
        status: WarRoomStatus.CLOSED,
        closedAt: new Date(),
        closedReason: reason,
        messages: {
          create: {
            userId: user.id,
            content: `War Room encerrada por ${user.name}. Motivo: ${reason}`,
            isSystem: true,
          },
        },
      },
    });

    this.logger.log(`War Room ${id} closed by ${user.email}`);
    return updated;
  }
}
