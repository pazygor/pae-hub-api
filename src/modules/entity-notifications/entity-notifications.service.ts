import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway, CopEventType } from '../realtime/realtime.gateway';

// Fase 3 — EntityNotification (DER §6.3): notificação disparada numa ocorrência.
// Progressão oficial: Notificada → Em Atendimento → Confirmada (Funcional §4.3).
@Injectable()
export class EntityNotificationsService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeGateway,
  ) {}

  async findAll(occurrenceId: string | undefined, user: any) {
    const occurrenceWhere: any = { organizationId: user.organizationId };
    if (user.role === 'terminal') occurrenceWhere.terminalId = user.terminalId ?? '—';

    const notifications = await this.prisma.entityNotification.findMany({
      where: {
        ...(occurrenceId ? { occurrenceId } : {}),
        occurrence: occurrenceWhere,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        entity: { select: { name: true, contact: true } },
        occurrence: { select: { incNumber: true } },
      },
    });

    return notifications.map((n) => this.format(n));
  }

  async updateStatus(id: string, status: string, user: any) {
    const notification = await this.prisma.entityNotification.findUnique({
      where: { id },
      include: { occurrence: { select: { organizationId: true } } },
    });
    if (!notification) throw new NotFoundException(`Notificação ${id} não encontrada`);
    if (notification.occurrence.organizationId !== user.organizationId) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }

    const data: any = { status };
    if (status === 'Confirmada') data.confirmedAt = new Date();
    if (status === 'Em Atendimento') data.respondingAt = new Date();

    const updated = await this.prisma.entityNotification.update({
      where: { id },
      data,
      include: {
        entity: { select: { name: true, contact: true } },
        occurrence: { select: { incNumber: true } },
      },
    });

    this.realtime.emitToOrganization(user.organizationId, CopEventType.NOTIFICATION_UPDATED, {
      notificationId: id,
      occurrenceId: notification.occurrenceId,
      status,
    });

    return this.format(updated);
  }

  private format(n: any) {
    return {
      id: n.id,
      occurrenceId: n.occurrenceId,
      incNumber: n.occurrence?.incNumber,
      entityId: n.entityId,
      entityName: n.entity?.name,
      dateTime: n.createdAt,
      status: n.status,
      mandatory: n.mandatory,
      confirmedAt: n.confirmedAt ?? undefined,
      respondingAt: n.respondingAt ?? undefined,
      dispatchedBy: n.dispatchedBy ?? undefined,
    };
  }
}
