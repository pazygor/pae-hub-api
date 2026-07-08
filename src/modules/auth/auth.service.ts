import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { LoginDto, ChangePasswordDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        terminal: { select: { id: true, name: true, code: true } },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Conta inativa ou suspensa');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user);

    this.logger.log(`User ${user.email} logged in`);

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: this.configService.get('JWT_EXPIRES_IN', '15m'),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        accessLevel: user.accessLevel,
        linkId: user.terminalId,
        terminalName: user.terminal?.name,
        tacticalManagerId: user.tacticalManagerId,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
        avatarUrl: user.avatarUrl,
        allowedModules: user.allowedModules,
        allowedTerminals: user.allowedTerminals,
        allowedOccurrenceTypes: user.allowedOccurrenceTypes,
        permissions: this.getPermissionsForRole(user.role, user.accessLevel),
      },
    };
  }

  async refreshTokens(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    if (stored.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Conta inativa');
    }

    // Rotate refresh token
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const tokens = await this.generateTokens(stored.user);
    return tokens;
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, token: refreshToken },
        data: { revokedAt: new Date() },
      });
    } else {
      // Revoke all refresh tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    this.logger.log(`User ${userId} logged out`);
    return { message: 'Logout realizado com sucesso' };
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BadRequestException('Senha atual incorreta');
    }

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens after password change
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Senha alterada com sucesso' };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        terminal: { select: { id: true, name: true, code: true } },
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessLevel: user.accessLevel,
      status: user.status,
      linkId: user.terminalId,
      terminalName: user.terminal?.name,
      tacticalManagerId: user.tacticalManagerId,
      organizationId: user.organizationId,
      organizationName: user.organization?.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      department: user.department,
      lastLoginAt: user.lastLoginAt,
      allowedModules: user.allowedModules,
      allowedTerminals: user.allowedTerminals,
      allowedOccurrenceTypes: user.allowedOccurrenceTypes,
      permissions: this.getPermissionsForRole(user.role, user.accessLevel),
    };
  }

  private async generateTokens(user: { id: string; email: string; role: string; accessLevel?: string | null; terminalId?: string | null; organizationId: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      accessLevel: user.accessLevel ?? null,
      terminalId: user.terminalId ?? null,
      organizationId: user.organizationId,
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshTokenValue = uuidv4() + '-' + uuidv4();
    const refreshExpiresIn = this.configService.get('JWT_REFRESH_EXPIRES_IN', '7d');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshTokenValue,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: refreshTokenValue };
  }

  /**
   * Permissões derivadas do modelo oficial (Funcional §2): admin / terminal(+nível) / entity.
   * Auxiliar — o front deriva o menu de role + accessLevel; isto complementa checagens finas.
   */
  private getPermissionsForRole(role: string, accessLevel?: string | null): string[] {
    const readBase = [
      'view_dashboard', 'view_cop', 'view_occurrences', 'view_map',
      'view_documents', 'view_plans', 'view_risks',
    ];
    const manageOperational = [
      'manage_occurrences', 'manage_plans', 'manage_risks', 'manage_map',
      'manage_documents', 'manage_trainings', 'manage_epis', 'manage_compliance',
    ];

    if (role === 'admin') {
      return [
        ...readBase, ...manageOperational, 'view_reports',
        'manage_users', 'manage_terminals', 'manage_entities',
        'manage_permissions', 'manage_modules', 'view_audit',
      ];
    }

    if (role === 'entity') {
      return ['view_cop', 'view_occurrences', 'view_map', 'view_documents'];
    }

    // role === 'terminal' — depende do nível de acesso
    if (accessLevel === 'operacional') return ['view_my_panel'];
    if (accessLevel === 'estratégico') return [...readBase, 'view_reports'];
    // tático (padrão)
    return [...readBase, ...manageOperational];
  }
}
