import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { EmergencyService } from './emergency.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway, CopEventType } from '../realtime/realtime.gateway';
import { OCCURRENCE_CHECKLIST_TEMPLATE } from '../../domain/enums';

// ─────────────────────────────────────────────────────────────────────────────
// EmergencyService — coração do PAE (fluxo-de-funcionamento §6.2/§6.3/§6.5):
// criação de ocorrência com INC-#### sequencial, timeline imutável semeada,
// checklist de 8 passos, acionamento automático de entidades
// (NotificationRule × Permission) e ciclo de status (resolução).
// Prisma e RealtimeGateway mockados — sem banco.
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  occurrence: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  organization: { update: jest.fn() },
  terminal: { findFirst: jest.fn() },
  notificationRule: { findMany: jest.fn() },
  entityNotification: { create: jest.fn() },
  occurrenceTimeline: { create: jest.fn() },
  user: { findUnique: jest.fn() },
};

const mockRealtime = {
  emitToOrganization: jest.fn(),
  emitToTerminal: jest.fn(),
  emitToUser: jest.fn(),
  emitToWarRoom: jest.fn(),
};

const adminUser = {
  id: 'admin-1', role: 'admin', name: 'Admin', email: 'admin@paehub.com',
  organizationId: 'org-1', allowedOccurrenceTypes: [],
};
const taticoUser = {
  id: 'user-1', role: 'terminal', accessLevel: 'tático', name: 'Carlos',
  email: 'carlos@tecon.com', organizationId: 'org-1', terminalId: 'term-1',
  allowedOccurrenceTypes: [],
};

/** Retorno padrão do occurrence.create (inclui campos lidos por autoDispatch). */
function createdOccurrence(overrides: Record<string, any> = {}) {
  return {
    id: 'occ-1', incNumber: 'INC-0001', type: 'Emergência', terminalId: 'term-1',
    organizationId: 'org-1', status: 'emergência ativa', createdAt: new Date(),
    terminal: { id: 'term-1', name: 'Terminal 1' }, timeline: [], checklist: [],
    ...overrides,
  };
}

describe('EmergencyService', () => {
  let service: EmergencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeGateway, useValue: mockRealtime },
      ],
    }).compile();

    service = module.get<EmergencyService>(EmergencyService);
    jest.clearAllMocks();
  });

  // ── Criação de ocorrência (§6.2) ──────────────────────────────────────────
  describe('create', () => {
    beforeEach(() => {
      mockPrisma.terminal.findFirst.mockResolvedValue({ id: 'term-1', organizationId: 'org-1' });
      mockPrisma.organization.update.mockResolvedValue({ occurrenceSeq: 1 });
      mockPrisma.occurrence.create.mockResolvedValue(createdOccurrence());
      mockPrisma.notificationRule.findMany.mockResolvedValue([]);
      mockPrisma.occurrence.findUnique.mockResolvedValue(createdOccurrence());
    });

    it('semeia a timeline "ocorrência registrada" e o checklist de 8 passos', async () => {
      await service.create({ type: 'Emergência', description: 'Incêndio na correia' } as any, taticoUser);

      const data = mockPrisma.occurrence.create.mock.calls[0][0].data;
      expect(data.timeline.create.eventType).toBe('ocorrência registrada');
      expect(data.checklist.create).toHaveLength(OCCURRENCE_CHECKLIST_TEMPLATE.length);
      expect(data.checklist.create).toHaveLength(8);
    });

    it('aplica os defaults status "aberto" e criticidade "média" quando não informados', async () => {
      await service.create({ type: 'Vazamento', description: 'Óleo no cais' } as any, taticoUser);

      const data = mockPrisma.occurrence.create.mock.calls[0][0].data;
      expect(data.status).toBe('aberto');
      expect(data.criticality).toBe('média');
    });

    it('gera INC-#### sequencial com padding de 4 dígitos', async () => {
      mockPrisma.organization.update.mockResolvedValue({ occurrenceSeq: 7 });

      await service.create({ type: 'Emergência', description: 'x' } as any, taticoUser);

      const data = mockPrisma.occurrence.create.mock.calls[0][0].data;
      expect(data.incNumber).toBe('INC-0007');
    });

    it('persiste a severidade e a criticidade do despacho (severity → criticality)', async () => {
      await service.create(
        { type: 'Emergência', description: 'Fogo', severity: 'alta', criticality: 'alta', status: 'emergência ativa' } as any,
        taticoUser,
      );

      const data = mockPrisma.occurrence.create.mock.calls[0][0].data;
      expect(data.severity).toBe('alta');
      expect(data.criticality).toBe('alta');
      expect(data.status).toBe('emergência ativa');
    });

    it('emite evento realtime OCCURRENCE_CREATED', async () => {
      await service.create({ type: 'Emergência', description: 'x' } as any, taticoUser);

      expect(mockRealtime.emitToOrganization).toHaveBeenCalledWith(
        'org-1', CopEventType.OCCURRENCE_CREATED, expect.objectContaining({ incNumber: 'INC-0001' }),
      );
    });

    it('lança BadRequestException quando não há terminal', async () => {
      await expect(
        service.create({ type: 'Emergência', description: 'x' } as any, { ...taticoUser, terminalId: undefined }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lança ForbiddenException quando o terminal não pertence à organização', async () => {
      mockPrisma.terminal.findFirst.mockResolvedValue(null);

      await expect(
        service.create({ type: 'Emergência', description: 'x' } as any, taticoUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('bloqueia tipo de ocorrência fora dos permitidos (Níveis de Acesso)', async () => {
      const restrito = { ...taticoUser, allowedOccurrenceTypes: ['Vazamento'] };

      await expect(
        service.create({ type: 'Emergência', description: 'x' } as any, restrito),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ── Acionamento automático de entidades (§5.6/§6.3) ───────────────────────
  describe('acionamento automático (NotificationRule × Permission)', () => {
    beforeEach(() => {
      mockPrisma.terminal.findFirst.mockResolvedValue({ id: 'term-1', organizationId: 'org-1' });
      mockPrisma.organization.update.mockResolvedValue({ occurrenceSeq: 1 });
      mockPrisma.occurrence.create.mockResolvedValue(createdOccurrence());
      mockPrisma.occurrence.findUnique.mockResolvedValue(createdOccurrence());
      mockPrisma.entityNotification.create.mockResolvedValue({});
      mockPrisma.occurrenceTimeline.create.mockResolvedValue({});
    });

    const regraBombeiros = {
      entityId: 'ent-1', mandatory: true,
      entity: { id: 'ent-1', name: 'Bombeiros', contact: '13999998888', status: 'Ativo', permission: { terminalIds: ['term-1'] } },
    };

    it('aciona a entidade quando a regra casa o tipo E a Permission cobre o terminal', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([regraBombeiros]);

      await service.create(
        { type: 'Emergência', description: 'Fogo', terminalId: 'term-1' } as any, adminUser,
      );

      expect(mockPrisma.entityNotification.create).toHaveBeenCalledTimes(1);
      const notif = mockPrisma.entityNotification.create.mock.calls[0][0].data;
      expect(notif.entityId).toBe('ent-1');
      expect(notif.status).toBe('Notificada');
      expect(notif.mandatory).toBe(true);

      const evt = mockPrisma.occurrenceTimeline.create.mock.calls[0][0].data;
      expect(evt.eventType).toBe('entidade notificada');
      expect(mockRealtime.emitToOrganization).toHaveBeenCalledWith(
        'org-1', CopEventType.NOTIFICATION_CREATED, expect.objectContaining({ entityId: 'ent-1' }),
      );
    });

    it('NÃO aciona quando a Permission da entidade não cobre o terminal', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { ...regraBombeiros, entity: { ...regraBombeiros.entity, permission: { terminalIds: ['term-9'] } } },
      ]);

      await service.create({ type: 'Emergência', description: 'x', terminalId: 'term-1' } as any, adminUser);

      expect(mockPrisma.entityNotification.create).not.toHaveBeenCalled();
    });

    it('NÃO aciona quando a entidade está Inativa', async () => {
      mockPrisma.notificationRule.findMany.mockResolvedValue([
        { ...regraBombeiros, entity: { ...regraBombeiros.entity, status: 'Inativo' } },
      ]);

      await service.create({ type: 'Emergência', description: 'x', terminalId: 'term-1' } as any, adminUser);

      expect(mockPrisma.entityNotification.create).not.toHaveBeenCalled();
    });
  });

  // ── Ciclo de status / resolução (§6.5) ────────────────────────────────────
  describe('updateStatus', () => {
    const occ = { id: 'occ-1', status: 'em atendimento', organizationId: 'org-1', terminalId: 'term-1', type: 'Emergência' };

    it('lança NotFoundException quando a ocorrência não existe', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('inexistente', { status: 'resolvido' } as any, adminUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('ao resolver, grava resolvedAt e evento "ocorrência resolvida" na timeline', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(occ);
      mockPrisma.occurrence.update.mockResolvedValue(createdOccurrence({ status: 'resolvido' }));

      await service.updateStatus('occ-1', { status: 'resolvido', comment: 'Controlado' } as any, adminUser);

      const data = mockPrisma.occurrence.update.mock.calls[0][0].data;
      expect(data.status).toBe('resolvido');
      expect(data.resolvedAt).toBeInstanceOf(Date);
      expect(data.timeline.create.eventType).toBe('ocorrência resolvida');
      expect(mockRealtime.emitToOrganization).toHaveBeenCalledWith(
        'org-1', CopEventType.OCCURRENCE_STATUS_CHANGED, expect.objectContaining({ status: 'resolvido' }),
      );
    });

    it('em transição não-final, registra "atualização de status" sem resolvedAt', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(occ);
      mockPrisma.occurrence.update.mockResolvedValue(createdOccurrence({ status: 'em atendimento' }));

      await service.updateStatus('occ-1', { status: 'em atendimento' } as any, adminUser);

      const data = mockPrisma.occurrence.update.mock.calls[0][0].data;
      expect(data.timeline.create.eventType).toBe('atualização de status');
      expect(data.resolvedAt).toBeUndefined();
    });
  });

  // ── Leitura e remoção ─────────────────────────────────────────────────────
  describe('findOne / remove', () => {
    it('findOne lança NotFoundException quando não encontrada', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente', adminUser)).rejects.toThrow(NotFoundException);
    });

    it('remove faz soft-delete (isActive = false)', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(
        { id: 'occ-1', organizationId: 'org-1', terminalId: 'term-1', type: 'Emergência' },
      );
      mockPrisma.occurrence.update.mockResolvedValue({});

      await service.remove('occ-1', adminUser);

      expect(mockPrisma.occurrence.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'occ-1' }, data: { isActive: false } }),
      );
    });
  });
});
