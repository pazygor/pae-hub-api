import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

// TTL do refresh token (auth.service). Sessão aberta além disso é considerada 'expirada'.
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecordInput {
  userId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: unknown;
  ip?: string;
  userAgent?: string;
}

interface AccessQuery {
  userId?: string;
  from?: string;
  to?: string;
  status?: 'ativa' | 'encerrada' | 'expirada';
  limit?: number | string;
}

interface ActivityQuery {
  userId?: string;
  resource?: string;
  action?: string;
  resourceId?: string;
  from?: string;
  to?: string;
  limit?: number | string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Registro de abertura-chave (ex.: Sala de Situação) com dedupe: uma mesma
   * abertura pode chegar 2x (remontagem/duplo-clique no front) — não gravamos
   * duplicata do mesmo usuário+recurso em janela curta (30s). É rede de segurança;
   * o front já deduplica a maioria dos casos antes de enviar.
   */
  async recordView(input: RecordInput): Promise<void> {
    try {
      const since = new Date(Date.now() - 30_000);
      const dup = await this.prisma.auditLog.findFirst({
        where: {
          userId: input.userId ?? null,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (dup) return;
    } catch (err: any) {
      this.logger.warn(`Falha no dedupe de view: ${err?.message ?? err}`);
    }
    await this.record(input);
  }

  // ── Item 2: gravar trilha de atividade (não pode derrubar a operação de origem) ──
  async record(input: RecordInput): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: input.userId ?? null,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId ?? null,
          details: (input.details ?? undefined) as any,
          ipAddress: input.ip ?? null,
          userAgent: input.userAgent ?? null,
        },
      });
    } catch (err: any) {
      this.logger.warn(`Falha ao gravar AuditLog: ${err?.message ?? err}`);
    }
  }

  // ── Item 1: sessões de acesso ──────────────────────────────────────────────
  async listAccess(q: AccessQuery) {
    const where: any = {};
    if (q.userId) where.userId = q.userId;
    const loginAt: any = {};
    if (q.from) loginAt.gte = new Date(q.from);
    if (q.to) loginAt.lte = new Date(q.to);
    if (Object.keys(loginAt).length) where.loginAt = loginAt;

    const cutoff = new Date(Date.now() - REFRESH_TTL_MS);
    const and: any[] = [];
    if (q.status === 'encerrada') and.push({ logoutAt: { not: null } });
    else if (q.status === 'ativa') and.push({ logoutAt: null }, { loginAt: { gte: cutoff } });
    else if (q.status === 'expirada') and.push({ logoutAt: null }, { loginAt: { lt: cutoff } });
    if (and.length) where.AND = and;

    const rows = await this.prisma.accessSession.findMany({
      where,
      orderBy: { loginAt: 'desc' },
      take: Math.min(Number(q.limit) || 200, 500),
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return { data: rows.map((r) => this.formatSession(r)), meta: { total: rows.length } };
  }

  async accessStats(q: { from?: string; to?: string }) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY_MS);

    const sessions = await this.prisma.accessSession.findMany({
      where: { loginAt: { gte: from, lte: to } },
      select: { userId: true, loginAt: true, logoutAt: true },
    });

    const totalAccess = sessions.length;
    const distinctUsers = new Set(sessions.map((s) => s.userId)).size;
    const finished = sessions.filter((s) => s.logoutAt);
    const avgDurationMs = finished.length
      ? Math.round(
          finished.reduce(
            (sum, s) => sum + (new Date(s.logoutAt!).getTime() - new Date(s.loginAt).getTime()),
            0,
          ) / finished.length,
        )
      : 0;

    const activeNow = await this.prisma.accessSession.count({
      where: { logoutAt: null, loginAt: { gte: new Date(Date.now() - REFRESH_TTL_MS) } },
    });

    const byDay = new Map<string, number>();
    for (const s of sessions) byDay.set(dayKey(s.loginAt), (byDay.get(dayKey(s.loginAt)) ?? 0) + 1);

    return { totalAccess, activeNow, avgDurationMs, distinctUsers, series: fillDailySeries(from, to, byDay) };
  }

  private formatSession(s: any) {
    const login = new Date(s.loginAt).getTime();
    const ttlEnd = login + REFRESH_TTL_MS;
    let status: 'ativa' | 'encerrada' | 'expirada';
    let durationMs: number;
    if (s.logoutAt) {
      status = 'encerrada';
      durationMs = new Date(s.logoutAt).getTime() - login;
    } else if (Date.now() > ttlEnd) {
      status = 'expirada';
      durationMs = REFRESH_TTL_MS;
    } else {
      status = 'ativa';
      durationMs = Date.now() - login;
    }
    return {
      id: s.id,
      userId: s.userId,
      userName: s.user?.name ?? '—',
      userEmail: s.user?.email ?? null,
      loginAt: s.loginAt,
      logoutAt: s.logoutAt,
      status,
      durationMs,
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
    };
  }

  // ── Item 2: trilha de atividade (AuditLog) ─────────────────────────────────
  async listActivity(q: ActivityQuery) {
    const where: any = {};
    if (q.userId) where.userId = q.userId;
    if (q.resource) where.resource = q.resource;
    if (q.action) where.action = q.action;
    if (q.resourceId) where.resourceId = q.resourceId;
    const createdAt: any = {};
    if (q.from) createdAt.gte = new Date(q.from);
    if (q.to) createdAt.lte = new Date(q.to);
    if (Object.keys(createdAt).length) where.createdAt = createdAt;

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(q.limit) || 200, 500),
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return {
      data: rows.map((r) => ({
        id: r.id,
        userId: r.userId,
        userName: r.user?.name ?? '—',
        action: r.action,
        resource: r.resource,
        resourceId: r.resourceId,
        details: r.details,
        ipAddress: r.ipAddress,
        createdAt: r.createdAt,
      })),
      meta: { total: rows.length },
    };
  }

  async activityStats(q: { from?: string; to?: string }) {
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 30 * DAY_MS);

    const rows = await this.prisma.auditLog.findMany({
      where: { createdAt: { gte: from, lte: to } },
      select: { userId: true, action: true, createdAt: true },
    });

    const total = rows.length;
    const distinctUsers = new Set(rows.map((r) => r.userId).filter(Boolean)).size;
    const byAction = new Map<string, number>();
    const byDay = new Map<string, number>();
    for (const r of rows) {
      byAction.set(r.action, (byAction.get(r.action) ?? 0) + 1);
      byDay.set(dayKey(r.createdAt), (byDay.get(dayKey(r.createdAt)) ?? 0) + 1);
    }

    return {
      total,
      distinctUsers,
      byAction: Array.from(byAction, ([action, count]) => ({ action, count })).sort((a, b) => b.count - a.count),
      series: fillDailySeries(from, to, byDay),
    };
  }
}

function dayKey(d: Date | string): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** Série diária contínua (preenche dias sem evento com 0) para o gráfico. */
function fillDailySeries(from: Date, to: Date, byDay: Map<string, number>) {
  const out: { date: string; count: number }[] = [];
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setUTCHours(0, 0, 0, 0);
  while (d <= end) {
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, count: byDay.get(key) ?? 0 });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}
