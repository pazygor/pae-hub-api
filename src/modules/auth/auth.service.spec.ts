import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    deleteMany: jest.fn(),
  },
};

const mockJwt = {
  sign: jest.fn().mockReturnValue('mock_token'),
  verify: jest.fn(),
};

const mockConfig = {
  get: jest.fn((key: string) => {
    const config: Record<string, any> = {
      JWT_SECRET: 'test_secret',
      JWT_EXPIRES_IN: '1h',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return config[key];
  }),
};

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

  describe('validateUser', () => {
    it('deve retornar o usuário quando credenciais são válidas', async () => {
      const passwordHash = await bcrypt.hash('senha123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash,
        status: 'ACTIVE',
        role: 'OPERATOR',
        name: 'Test User',
        organizationId: 'org1',
        terminalId: 'term1',
      });

      const result = await service.validateUser('test@test.com', 'senha123');
      expect(result).toBeDefined();
      expect(result!.email).toBe('test@test.com');
    });

    it('deve retornar null quando usuário não existe', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      const result = await service.validateUser('inexistente@test.com', 'senha');
      expect(result).toBeNull();
    });

    it('deve retornar null quando senha é incorreta', async () => {
      const passwordHash = await bcrypt.hash('senha_correta', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash,
        status: 'ACTIVE',
      });

      const result = await service.validateUser('test@test.com', 'senha_errada');
      expect(result).toBeNull();
    });

    it('deve retornar null quando usuário está suspenso', async () => {
      const passwordHash = await bcrypt.hash('senha123', 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '1',
        email: 'test@test.com',
        passwordHash,
        status: 'SUSPENDED',
      });

      const result = await service.validateUser('test@test.com', 'senha123');
      expect(result).toBeNull();
    });
  });

  describe('login', () => {
    it('deve lançar UnauthorizedException quando credenciais são inválidas', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
