import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OCCURRENCE_CHECKLIST_TEMPLATE } from '../../domain/enums';
import {
  CreateOccurrenceDto,
  UpdateOccurrenceDto,
  UpdateOccurrenceStatusDto,
  CreateTimelineEventDto,
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
  CreateEvidenceDto,
  OccurrenceQueryDto,
} from './dto/occurrence.dto';

// Fase 2 — vocabulário pt-BR do DER (§6.3), INC-#### sequencial por organização,
// timeline imutável (só INSERT), checklist de 8 passos semeado na criação.
@Injectable()
export class EmergencyService {
  private readonly logger = new Logger(EmergencyService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: OccurrenceQueryDto, user: any) {
    const { status, criticality, type, terminalId, search, page = 1, limit = 50 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { isActive: true, ...(await this.tenantWhere(user)) };

    if (terminalId && terminalId !== 'all') where.terminalId = terminalId;
    if (status) where.status = status;
    if (criticality) where.criticality = criticality;
    if (type) where.type = { contains: type, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { incNumber: { contains: search, mode: 'insensitive' } },
        { type: { contains: search, mode: 'insensitive' } },
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
          timeline: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
        },
      }),
      this.prisma.occurrence.count({ where }),
    ]);

    return {
      data: items.map((o) => this.formatOccurrence(o)),
      meta: { total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) },
    };
  }

  async findOne(id: string, user: any) {
    const occurrence = await this.prisma.occurrence.findUnique({
      where: { id },
      include: {
        terminal: { select: { id: true, name: true, latitude: true, longitude: true } },
        reportedBy: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
        checklist: { orderBy: { order: 'asc' } },
        evidences: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!occurrence) throw new NotFoundException(`Ocorrência ${id} não encontrada`);
    await this.checkTenantAccess(occurrence, user);

    return this.formatOccurrenceDetail(occurrence);
  }

  async create(dto: CreateOccurrenceDto, user: any) {
    const terminalId = user.role === 'admin' ? dto.terminalId : (user.terminalId ?? dto.terminalId);
    if (!terminalId) throw new BadRequestException('Terminal não informado');

    // Terminal precisa existir e pertencer à organização do usuário
    const terminal = await this.prisma.terminal.findFirst({
      where: { id: terminalId, organizationId: user.organizationId },
    });
    if (!terminal) throw new ForbiddenException('Terminal inválido para esta organização');

    const incNumber = await this.nextIncNumber(user.organizationId);

    const occurrence = await this.prisma.occurrence.create({
      data: {
        organizationId: user.organizationId,
        incNumber,
        terminalId,
        type: dto.type,
        description: dto.description,
        status: dto.status ?? 'aberto',
        criticality: dto.criticality ?? 'média',
        severity: dto.severity,
        responsible: dto.responsible ?? user.name,
        team: dto.team,
        location: dto.location,
        latitude: dto.latitude,
        longitude: dto.longitude,
        reportedByUserId: user.id,
        timeline: {
          create: {
            userId: user.id,
            eventType: 'ocorrência registrada',
            description: dto.description,
          },
        },
        // Funcional §3.3: checklist de 8 passos nasce com a ocorrência
        checklist: {
          create: OCCURRENCE_CHECKLIST_TEMPLATE.map((text, i) => ({ title: text, order: i })),
        },
      },
      include: {
        terminal: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
        checklist: { orderBy: { order: 'asc' } },
      },
    });

    this.logger.log(`Occurrence ${occurrence.incNumber} created by ${user.email}`);
    return this.formatOccurrenceDetail(occurrence);
  }

  async update(id: string, dto: UpdateOccurrenceDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    await this.checkTenantAccess(occurrence, user);

    // terminalId/status têm fluxos próprios — não passam pelo update genérico
    const { terminalId: _t, status: _s, ...fields } = dto;

    const updated = await this.prisma.occurrence.update({
      where: { id },
      data: { ...fields, updatedAt: new Date() },
      include: {
        terminal: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
      },
    });

    return this.formatOccurrence(updated);
  }

  async updateStatus(id: string, dto: UpdateOccurrenceStatusDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    await this.checkTenantAccess(occurrence, user);

    const resolved = dto.status === 'resolvido';
    const data: any = { status: dto.status, updatedAt: new Date() };
    if (resolved) data.resolvedAt = new Date();

    const updated = await this.prisma.occurrence.update({
      where: { id },
      data: {
        ...data,
        timeline: {
          create: {
            userId: user.id,
            eventType: resolved ? 'ocorrência resolvida' : 'atualização de status',
            description: dto.comment || `Status alterado de "${occurrence.status}" para "${dto.status}"`,
            metadata: { previousStatus: occurrence.status, newStatus: dto.status },
          },
        },
      },
      include: {
        terminal: { select: { id: true, name: true } },
        timeline: { orderBy: { createdAt: 'asc' }, include: { user: { select: { name: true } } } },
      },
    });

    return this.formatOccurrence(updated);
  }

  // ── Timeline (imutável — só INSERT) ────────────────────────────────────────

  async addTimelineEvent(id: string, dto: CreateTimelineEventDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    await this.checkTenantAccess(occurrence, user);

    const event = await this.prisma.occurrenceTimeline.create({
      data: {
        occurrenceId: id,
        userId: user.id,
        eventType: dto.type,
        description: dto.description,
        attachment: dto.attachment,
      },
      include: { user: { select: { name: true } } },
    });

    return this.formatTimelineEvent(event);
  }

  // ── Checklist ──────────────────────────────────────────────────────────────

  async addChecklistItem(id: string, dto: CreateChecklistItemDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    await this.checkTenantAccess(occurrence, user);

    const last = await this.prisma.checklistItem.findFirst({
      where: { occurrenceId: id },
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const item = await this.prisma.checklistItem.create({
      data: { occurrenceId: id, title: dto.text, order: (last?.order ?? -1) + 1 },
    });

    return this.formatChecklistItem(item);
  }

  async updateChecklistItem(id: string, itemId: string, dto: UpdateChecklistItemDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    await this.checkTenantAccess(occurrence, user);

    const item = await this.prisma.checklistItem.findFirst({ where: { id: itemId, occurrenceId: id } });
    if (!item) throw new NotFoundException(`Item de checklist ${itemId} não encontrado`);

    const updated = await this.prisma.checklistItem.update({
      where: { id: itemId },
      data: {
        isCompleted: dto.done,
        completedAt: dto.done ? new Date() : null,
        completedBy: dto.done ? user.name : null,
      },
    });

    return this.formatChecklistItem(updated);
  }

  // ── Evidências (só metadados na Fase 2 — upload real na Fase 6) ─────────────

  async addEvidence(id: string, dto: CreateEvidenceDto, user: any) {
    const occurrence = await this.findOneRaw(id);
    await this.checkTenantAccess(occurrence, user);

    const evidence = await this.prisma.evidence.create({
      data: {
        occurrenceId: id,
        uploadedById: user.id,
        type: dto.type ?? 'documento',
        filename: dto.filename,
        description: dto.description,
      },
    });

    return this.formatEvidence(evidence);
  }

  async remove(id: string, user: any) {
    const occurrence = await this.findOneRaw(id);
    await this.checkTenantAccess(occurrence, user);

    await this.prisma.occurrence.update({ where: { id }, data: { isActive: false } });
    return { message: 'Ocorrência removida com sucesso' };
  }

  // ── Internos ────────────────────────────────────────────────────────────────

  /** INC-#### atômico por organização (contador `occurrenceSeq`). */
  private async nextIncNumber(organizationId: string): Promise<string> {
    const org = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { occurrenceSeq: { increment: 1 } },
      select: { occurrenceSeq: true },
    });
    return `INC-${String(org.occurrenceSeq).padStart(4, '0')}`;
  }

  /** Escopo multi-tenant: admin→organização; terminal→próprio terminal; entity→terminais permitidos. */
  private async tenantWhere(user: any): Promise<Record<string, any>> {
    if (user.role === 'admin') return { organizationId: user.organizationId };
    if (user.role === 'terminal') return { terminalId: user.terminalId ?? '—' };
    // entity: allowedTerminals do cadastro (refinado com Permission na Fase 3)
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { allowedTerminals: true },
    });
    return { terminalId: { in: dbUser?.allowedTerminals ?? [] } };
  }

  private async checkTenantAccess(occurrence: any, user: any) {
    if (user.role === 'admin') {
      if (occurrence.organizationId !== user.organizationId) {
        throw new ForbiddenException('Acesso negado a este recurso');
      }
      return;
    }
    if (user.role === 'terminal') {
      if (occurrence.terminalId !== user.terminalId) {
        throw new ForbiddenException('Acesso negado a este recurso');
      }
      return;
    }
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { allowedTerminals: true },
    });
    if (!dbUser?.allowedTerminals?.includes(occurrence.terminalId)) {
      throw new ForbiddenException('Acesso negado a este recurso');
    }
  }

  private async findOneRaw(id: string) {
    const occurrence = await this.prisma.occurrence.findUnique({ where: { id } });
    if (!occurrence) throw new NotFoundException(`Ocorrência ${id} não encontrada`);
    return occurrence;
  }

  // ── Formatação (shape alinhado ao front — pae-app/src/lib/types.ts) ────────

  private formatOccurrence(o: any) {
    return {
      id: o.id,
      incNumber: o.incNumber,
      terminalId: o.terminalId,
      terminalName: o.terminal?.name,
      dateTime: o.createdAt,
      type: o.type,
      description: o.description,
      status: o.status,
      criticality: o.criticality,
      severity: o.severity ?? undefined,
      responsible: o.responsible ?? '',
      team: o.team ?? '',
      location: o.location ?? undefined,
      latitude: o.latitude ?? undefined,
      longitude: o.longitude ?? undefined,
      timeline: o.timeline?.map((t: any) => this.formatTimelineEvent(t)) ?? [],
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      resolvedAt: o.resolvedAt,
    };
  }

  private formatOccurrenceDetail(o: any) {
    return {
      ...this.formatOccurrence(o),
      checklist: o.checklist?.map((c: any) => this.formatChecklistItem(c)) ?? [],
      evidences: o.evidences?.map((e: any) => this.formatEvidence(e)) ?? [],
    };
  }

  private formatTimelineEvent(t: any) {
    return {
      id: t.id,
      dateTime: t.createdAt,
      type: t.eventType,
      description: t.description,
      userName: t.user?.name ?? 'Sistema',
      attachment: t.attachment ?? undefined,
    };
  }

  private formatChecklistItem(c: any) {
    return {
      id: c.id,
      text: c.title,
      done: c.isCompleted,
      completedAt: c.completedAt ?? undefined,
      completedBy: c.completedBy ?? undefined,
      order: c.order,
    };
  }

  private formatEvidence(e: any) {
    return {
      id: e.id,
      filename: e.filename,
      type: e.type,
      description: e.description ?? undefined,
      createdAt: e.createdAt,
    };
  }
}
