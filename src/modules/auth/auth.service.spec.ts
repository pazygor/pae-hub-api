import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

// ─────────────────────────────────────────────────────────────────────────────
// AuthService — fluxo de sessão (fluxo-de-funcionamento §4).
// Login com JWT, bloqueio de conta inativa/suspensa e renovação de token.
// Prisma e JWT mockados (sem banco).
// ─────────────────────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
  },
  // Auditoria de acesso (item 1) — login abre e logout fecha a sessão.
  accessSession: {
    create: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('signed.jwt.token'),
  verify: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string, fallback?: string) => {
    const config: Record<string, string> = {
      JWT_SECRET: 'test_secret',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return config[key] ?? fallback;
  }),
};

/** Usuário ACTIVE de referência (perfil tático, seed carlos@tecon.com). */
async function activeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    name: 'Carlos Silva',
    email: 'carlos@tecon.com',
    passwordHash: await bcrypt.hash('terminal123', 10),
    status: 'ACTIVE',
    role: 'terminal',
    accessLevel: 'tático',
    terminalId: 'term-1',
    tacticalManagerId: null,
    organizationId: 'org-1',
    avatarUrl: null,
    allowedModules: [],
    allowedTerminals: [],
    allowedOccurrenceTypes: [],
    organization: { id: 'org-1', name: 'Porto Tecon', slug: 'tecon' },
    terminal: { id: 'term-1', name: 'Terminal 1', code: 'T1' },
    ...overrides,
  };
}

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwt },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('retorna accessToken, refreshToken e o usuário com credenciais válidas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(await activeUser());
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      const result = await service.login({ email: 'carlos@tecon.com', password: 'terminal123' });

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('carlos@tecon.com');
      // linkId espelha o terminalId (vínculo) — contrato consumido pelo front
      expect(result.user.linkId).toBe('term-1');
      expect(mockPrisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it('normaliza o e-mail para minúsculas na busca', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(await activeUser());
      mockPrisma.user.update.mockResolvedValue({});
      mockPrisma.refreshToken.create.mockResolvedValue({});

      await service.login({ email: 'CARLOS@TECON.COM', password: 'terminal123' });

      const where = mockPrisma.user.findUnique.mock.calls[0][0].where;
      expect(where.email).toBe('carlos@tecon.com');
    });

    it('lança UnauthorizedException quando o usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'ninguem@test.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException quando a senha está incorreta', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(await activeUser());

      await expect(
        service.login({ email: 'carlos@tecon.com', password: 'senha_errada' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException quando a conta não está ACTIVE (suspensa)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(await activeUser({ status: 'SUSPENDED' }));

      await expect(
        service.login({ email: 'carlos@tecon.com', password: 'terminal123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshTokens', () => {
    it('lança UnauthorizedException quando o refresh token não existe', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens('inexistente')).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException quando o refresh token está expirado', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        token: 'expirado',
        revokedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        user: await activeUser(),
      });

      await expect(service.refreshTokens('expirado')).rejects.toThrow(UnauthorizedException);
    });

    it('lança UnauthorizedException quando o refresh token foi revogado', async () => {
      mockPrisma.refreshToken.findUnique.mockResolvedValue({
        token: 'revogado',
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 100000),
        user: await activeUser(),
      });

      await expect(service.refreshTokens('revogado')).rejects.toThrow(UnauthorizedException);
    });
  });
});
