import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OccurrenceStatus, AlertStatus, SafetyItemStatus } from '@prisma/client';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private prisma: PrismaService) {}

  async getKpis(terminalId?: string, organizationId?: string) {
    const occurrenceWhere: any = { isActive: true };
    const alertWhere: any = {};
    const safetyWhere: any = {};

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
      criticalOccurrences,
      resolvedLast24h,
      newLast24h,
      activeAlerts,
      criticalAlerts,
      overdueItems,
      occurrencesByStatus,
      occurrencesBySeverity,
      recentOccurrences,
    ] = await Promise.all([
      this.prisma.occurrence.count({ where: occurrenceWhere }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, status: OccurrenceStatus.OPEN } }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, severity: 'CRITICAL', status: { not: OccurrenceStatus.CLOSED } } }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, resolvedAt: { gte: last24h } } }),
      this.prisma.occurrence.count({ where: { ...occurrenceWhere, createdAt: { gte: last24h } } }),
      this.prisma.alert.count({ where: { ...alertWhere, status: AlertStatus.ACTIVE } }),
      this.prisma.alert.count({ where: { ...alertWhere, status: AlertStatus.ACTIVE, severity: 'CRITICAL' } }),
      this.prisma.safetyItem.count({
        where: { ...safetyWhere, status: { not: SafetyItemStatus.COMPLETED }, dueDate: { lt: now } },
      }),
      this.prisma.occurrence.groupBy({
        by: ['status'],
        where: occurrenceWhere,
        _count: true,
      }),
      this.prisma.occurrence.groupBy({
        by: ['severity'],
        where: occurrenceWhere,
        _count: true,
      }),
      this.prisma.occurrence.findMany({
        where: { ...occurrenceWhere, createdAt: { gte: last7d } },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true, code: true, title: true, severity: true, status: true, createdAt: true,
          terminal: { select: { name: true } },
        },
      }),
    ]);

    // Compute avg resolution time manually
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
        criticalOccurrences,
        resolvedLast24h,
        newLast24h,
        activeAlerts,
        criticalAlerts,
        overdueItems,
        avgResolutionHours: Math.round(avgResolutionHours * 10) / 10,
      },
      charts: {
        occurrencesByStatus: occurrencesByStatus.map((s) => ({ status: s.status, count: s._count })),
        occurrencesBySeverity: occurrencesBySeverity.map((s) => ({ severity: s.severity, count: s._count })),
      },
      recentOccurrences,
    };
  }

  async getCopIndicators(terminalId?: string) {
    const where: any = { isActive: true };
    if (terminalId) where.terminalId = terminalId;

    const [open, inProgress, critical, warRoomsActive] = await Promise.all([
      this.prisma.occurrence.count({ where: { ...where, status: OccurrenceStatus.OPEN } }),
      this.prisma.occurrence.count({ where: { ...where, status: OccurrenceStatus.IN_PROGRESS } }),
      this.prisma.occurrence.count({ where: { ...where, severity: 'CRITICAL', status: { not: OccurrenceStatus.CLOSED } } }),
      this.prisma.warRoom.count({ where: { status: 'ACTIVE' } }),
    ]);

    return {
      openOccurrences: open,
      inProgressOccurrences: inProgress,
      criticalOccurrences: critical,
      activeWarRooms: warRoomsActive,
    };
  }
}
