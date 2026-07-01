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
        terminalId: user.terminalId,
        terminalName: user.terminal?.name,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
        avatarUrl: user.avatarUrl,
        permissions: this.getPermissionsForRole(user.role),
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
      status: user.status,
      terminalId: user.terminalId,
      terminalName: user.terminal?.name,
      organizationId: user.organizationId,
      organizationName: user.organization?.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      department: user.department,
      lastLoginAt: user.lastLoginAt,
      permissions: this.getPermissionsForRole(user.role),
    };
  }

  private async generateTokens(user: { id: string; email: string; role: string; terminalId?: string | null; organizationId: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      terminalId: user.terminalId ?? undefined,
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

  private getPermissionsForRole(role: string): string[] {
    const basePermissions = ['emergency.read', 'view_dashboard', 'view_cop', 'view_occurrences', 'view_alerts', 'view_safety'];
    const operatorPermissions = [...basePermissions, 'view_warroom', 'view_aicommand', 'emergency.create', 'emergency.update', 'manage_occurrences', 'manage_warroom'];
    const managerPermissions = [...operatorPermissions, 'emergency.delete', 'manage_alerts', 'manage_safety', 'view_reports'];
    const adminPermissions = [...managerPermissions, 'manage_users', 'manage_roles', 'manage_organizations', 'view_audit_logs', 'manage_ai'];
    const superAdminPermissions = [...adminPermissions, 'manage_system', 'manage_terminals'];

    switch (role) {
      case 'SUPER_ADMIN': return superAdminPermissions;
      case 'ADMIN': return adminPermissions;
      case 'MANAGER': return managerPermissions;
      case 'OPERATOR': return operatorPermissions;
      default: return basePermissions;
    }
  }
}
