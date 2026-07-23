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
import { PRODUCT_MODULE } from '../../domain/enums';
import { terminalModulesView, effectiveSafetySubModules, ProductModule, SafetySubModule } from '../../common/helpers/module-config';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        terminal: { select: { id: true, name: true, code: true, activeModules: true, activeSafetySubModules: true } },
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

    // Auditoria de acesso (item 1): abre a sessão. Falha aqui não derruba o login.
    await this.prisma.accessSession
      .create({ data: { userId: user.id, ipAddress: meta?.ip, userAgent: meta?.userAgent } })
      .catch((err) => this.logger.warn(`Falha ao registrar AccessSession: ${err?.message ?? err}`));

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
        linkId: user.role === 'entity' ? user.entityId : user.terminalId,
        terminalName: user.terminal?.name,
        tacticalManagerId: user.tacticalManagerId,
        organizationId: user.organizationId,
        organizationName: user.organization?.name,
        avatarUrl: user.avatarUrl,
        alertsSeenAt: user.alertsSeenAt,
        termsAcceptedAt: user.termsAcceptedAt,
        termsVersion: user.termsVersion,
        allowedModules: user.allowedModules,
        // Entity: terminais visíveis derivam da Permissão (para filtro de notificação no front).
        allowedTerminals: await this.effectiveAllowedTerminals(user),
        allowedOccurrenceTypes: user.allowedOccurrenceTypes,
        modules: this.modulesForUser(user),
        permissions: this.getPermissionsForRole(user.role, user.accessLevel),
      },
    };
  }

  /**
   * Módulos ativos no contexto do usuário (item 7), para o front gatear o menu:
   * - terminal: a config do próprio terminal;
   * - admin: tudo (administra todos os terminais);
   * - entity: só Response (entidades não têm Safety).
   */
  private modulesForUser(user: {
    role: string;
    terminal?: { activeModules?: string[] | null; activeSafetySubModules?: string[] | null } | null;
  }): { active: ProductModule[]; safetySubModules: SafetySubModule[] } {
    if (user.role === 'admin') {
      return { active: [...PRODUCT_MODULE], safetySubModules: effectiveSafetySubModules(['trainings', 'epis']) };
    }
    if (user.role === 'terminal' && user.terminal) {
      return terminalModulesView(user.terminal);
    }
    return { active: ['emergency_management'], safetySubModules: [] };
  }

  /** Terminais visíveis do usuário: entity deriva da Permissão da sua entidade;
   *  demais papéis usam o próprio campo allowedTerminals. */
  private async effectiveAllowedTerminals(
    user: { role: string; entityId?: string | null; allowedTerminals?: string[] | null },
  ): Promise<string[]> {
    if (user.role === 'entity' && user.entityId) {
      const perm = await this.prisma.permission.findUnique({
        where: { entityId: user.entityId },
        select: { terminalIds: true },
      });
      return perm?.terminalIds ?? [];
    }
    return user.allowedTerminals ?? [];
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
      // Auditoria (item 1): saída de UMA sessão → fecha a aberta mais recente.
      await this.closeOpenSessions(userId, false);
    } else {
      // Revoke all refresh tokens for user
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      // Auditoria (item 1): "logout all" → fecha todas as sessões abertas.
      await this.closeOpenSessions(userId, true);
    }
    this.logger.log(`User ${userId} logged out`);
    return { message: 'Logout realizado com sucesso' };
  }

  /** Fecha sessão(ões) de acesso aberta(s) do usuário (endReason 'logout'). */
  private async closeOpenSessions(userId: string, all: boolean) {
    try {
      if (all) {
        await this.prisma.accessSession.updateMany({
          where: { userId, logoutAt: null },
          data: { logoutAt: new Date(), endReason: 'logout' },
        });
        return;
      }
      const open = await this.prisma.accessSession.findFirst({
        where: { userId, logoutAt: null },
        orderBy: { loginAt: 'desc' },
      });
      if (open) {
        await this.prisma.accessSession.update({
          where: { id: open.id },
          data: { logoutAt: new Date(), endReason: 'logout' },
        });
      }
    } catch (err: any) {
      this.logger.warn(`Falha ao fechar AccessSession: ${err?.message ?? err}`);
    }
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

    // Segurança: revoga TODAS as sessões existentes (outros dispositivos caem).
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // UX: emite tokens novos para a sessão ATUAL — quem trocou a própria senha
    // continua logado neste dispositivo (o refresh novo é criado após a revogação).
    const tokens = await this.generateTokens(user);
    return { message: 'Senha alterada com sucesso', ...tokens };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        organization: { select: { id: true, name: true, slug: true } },
        terminal: { select: { id: true, name: true, code: true, activeModules: true, activeSafetySubModules: true } },
      },
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      accessLevel: user.accessLevel,
      status: user.status,
      linkId: user.role === 'entity' ? user.entityId : user.terminalId,
      terminalName: user.terminal?.name,
      tacticalManagerId: user.tacticalManagerId,
      organizationId: user.organizationId,
      organizationName: user.organization?.name,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      department: user.department,
      lastLoginAt: user.lastLoginAt,
      alertsSeenAt: user.alertsSeenAt,
      termsAcceptedAt: user.termsAcceptedAt,
      termsVersion: user.termsVersion,
      allowedModules: user.allowedModules,
      allowedTerminals: await this.effectiveAllowedTerminals(user),
      allowedOccurrenceTypes: user.allowedOccurrenceTypes,
      modules: this.modulesForUser(user),
      permissions: this.getPermissionsForRole(user.role, user.accessLevel),
    };
  }

  /**
   * Marca os alertas de ocorrência como vistos (agora). Chamado pelo front ao
   * fechar o modal de alerta — o próximo login só re-alerta o que vier depois.
   */
  async markAlertsSeen(userId: string) {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { alertsSeenAt: new Date() },
      select: { alertsSeenAt: true },
    });
    return updated;
  }

  /**
   * Registra o aceite do Termo de Consentimento (item 6). Grava UMA linha imutável
   * em TermsAcceptance (com ip/userAgent) e atualiza o gating no User.
   */
  async acceptTerms(userId: string, version: string, meta?: { ip?: string; userAgent?: string }) {
    const now = new Date();
    await this.prisma.termsAcceptance.create({
      data: { userId, termsVersion: version, acceptedAt: now, ip: meta?.ip, userAgent: meta?.userAgent },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { termsAcceptedAt: now, termsVersion: version },
    });
    return { termsAcceptedAt: now, termsVersion: version };
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
