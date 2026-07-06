import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertStatus, SafetyItemStatus } from '@prisma/client';

// Fase 2: KPIs/indicadores calculados sobre o vocabulário pt-BR do DER
// ('aberto' | 'em atendimento' | 'emergência ativa' | 'resolvido').
@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService) {}

  async getKpis(terminalId?: string, organizationId?: string) {
    const occurrenceWhere: any = { isActive: true };
    const alertWhere: any = {};
    const safetyWhere: any = {};

    if (organizationId) occurrenceWhere.organizationId = organizationId;
    if (terminalId) {
      occurrenceWhere.terminalId = terminalId;
      alertWhere.terminalId = terminalId;
      safetyWhere.terminalId = terminalId;
    }

    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalOccurrences,
      openOccurrences,
      activeEmergencies,
      criticalOccurrences,
      resolvedLast24h,
      newLast24h,
      activeAlerts,
      overdueItems,
      occurrencesByStatus,
      occurrencesByCriticality,
      recentOccurrences,
    ] = await Promise.all([
      this.prisma.occurrence.count({ where: occurrenceWhere }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, status: 'aberto' } }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, status: 'emergência ativa' } }),
      this.prisma.occurrence.count({
        where: { ...occurrenceWhere, criticality: 'crítica', status: { not: 'resolvido' } },
      }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, resolvedAt: { gte: last24h } } }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, createdAt: { gte: last24h } } }),
      this.prisma.alert.count({ where: { ...alertWhere, status: AlertStatus.ACTIVE } }),
      this.prisma.safetyItem.count({
        where: { ...safetyWhere, status: { not: SafetyItemStatus.COMPLETED }, dueDate: { lt: now } },
      }),
      this.prisma.occurrence.groupBy({ by: ['status'], where: occurrenceWhere, _count: true }),
      this.prisma.occurrence.groupBy({ by: ['criticality'], where: occurrenceWhere, _count: true }),
      this.prisma.occurrence.findMany({
        where: { ...occurrenceWhere, createdAt: { gte: last7d } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, incNumber: true, type: true, criticality: true, status: true, createdAt: true,
          terminal: { select: { name: true } },
        },
      }),
    ]);

    const resolvedWithTime = await this.prisma.occurrence.findMany({
      where: { ...occurrenceWhere, resolvedAt: { not: null, gte: last30d } },
      select: { createdAt: true, resolvedAt: true },
    });

    const avgResolutionHours = resolvedWithTime.length > 0
      ? resolvedWithTime.reduce((acc, o) => {
          const diff = (o.resolvedAt!.getTime() - o.createdAt.getTime()) / (1000 * 60 * 60);
          return acc + diff;
        }, 0) / resolvedWithTime.length
      : 0;

    return {
      summary: {
        totalOccurrences,
        openOccurrences,
        activeEmergencies,
        criticalOccurrences,
        resolvedLast24h,
        newLast24h,
        activeAlerts,
        overdueItems,
        avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      },
      charts: {
        occurrencesByStatus: occurrencesByStatus.map((s) => ({ status: s.status, count: s._count })),
        occurrencesByCriticality: occurrencesByCriticality.map((s) => ({ criticality: s.criticality, count: s._count })),
      },
      recentOccurrences: recentOccurrences.map((o) => ({
        id: o.id,
        incNumber: o.incNumber,
        type: o.type,
        criticality: o.criticality,
        status: o.status,
        createdAt: o.createdAt,
        terminalName: o.terminal?.name,
      })),
    };
  }

  async getCopIndicators(terminalId?: string, organizationId?: string) {
    const where: any = { isActive: true };
    if (organizationId) where.organizationId = organizationId;
    if (terminalId) where.terminalId = terminalId;

    const [open, inProgress, activeEmergencies, critical, resolved, total] = await Promise.all([
      this.prisma.occurrence.count({ where: { ...where, status: 'aberto' } }),
      this.prisma.occurrence.count({ where: { ...where, status: 'em atendimento' } }),
      this.prisma.occurrence.count({ where: { ...where, status: 'emergência ativa' } }),
      this.prisma.occurrence.count({
        where: { ...where, criticality: 'crítica', status: { not: 'resolvido' } },
      }),
      this.prisma.occurrence.count({ where: { ...where, status: 'resolvido' } }),
      this.prisma.occurrence.count({ where }),
    ]);

    return {
      openOccurrences: open,
      inProgressOccurrences: inProgress,
      activeEmergencies,
      criticalOccurrences: critical,
      resolvedOccurrences: resolved,
      totalOccurrences: total,
    };
  }
}
