import { Test, TestingModule } from '@nestjs/testing';
import { EmergencyService } from './emergency.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { OccurrenceStatus, OccurrenceSeverity, OccurrenceCriticality, OccurrenceType } from '@prisma/client';

const mockOccurrence = {
  id: 'occ-1',
  code: 'OCC-2026-0001',
  title: 'Incêndio na correia C-07',
  type: OccurrenceType.FIRE,
  severity: OccurrenceSeverity.HIGH,
  criticality: OccurrenceCriticality.EMERGENCY,
  status: OccurrenceStatus.OPEN,
  terminalId: 'term-1',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPrisma = {
  occurrence: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
    aggregate: jest.fn(),
  },
  occurrenceTimeline: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('EmergencyService', () => {
  let service: EmergencyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmergencyService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EmergencyService>(EmergencyService);
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('deve retornar lista paginada de ocorrências', async () => {
      mockPrisma.occurrence.findMany.mockResolvedValue([mockOccurrence]);
      mockPrisma.occurrence.count.mockResolvedValue(1);

      const result = await service.findAll({}, { terminalId: 'term-1', organizationId: 'org-1' });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockPrisma.occurrence.findMany).toHaveBeenCalledTimes(1);
    });

    it('deve filtrar por status quando fornecido', async () => {
      mockPrisma.occurrence.findMany.mockResolvedValue([]);
      mockPrisma.occurrence.count.mockResolvedValue(0);

      await service.findAll({ status: OccurrenceStatus.OPEN }, { terminalId: 'term-1' });

      const callArgs = mockPrisma.occurrence.findMany.mock.calls[0][0];
      expect(callArgs.where.status).toBe(OccurrenceStatus.OPEN);
    });

    it('deve filtrar por severidade quando fornecida', async () => {
      mockPrisma.occurrence.findMany.mockResolvedValue([]);
      mockPrisma.occurrence.count.mockResolvedValue(0);

      await service.findAll({ severity: OccurrenceSeverity.CRITICAL }, { terminalId: 'term-1' });

      const callArgs = mockPrisma.occurrence.findMany.mock.calls[0][0];
      expect(callArgs.where.severity).toBe(OccurrenceSeverity.CRITICAL);
    });
  });

  describe('findOne', () => {
    it('deve retornar ocorrência quando encontrada', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(mockOccurrence);

      const result = await service.findOne('occ-1');
      expect(result).toEqual(mockOccurrence);
    });

    it('deve lançar NotFoundException quando não encontrada', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(null);

      await expect(service.findOne('inexistente')).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateStatus', () => {
    it('deve lançar NotFoundException quando ocorrência não existe', async () => {
      mockPrisma.occurrence.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('inexistente', OccurrenceStatus.RESOLVED, 'Resolvido', { id: 'user-1' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
