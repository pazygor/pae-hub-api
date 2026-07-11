import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { IsEmail, IsIn, IsOptional, IsString, MinLength, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { USER_ROLES, ACCESS_LEVELS, OCCURRENCE_TYPES } from '../../domain/enums';

export class CreateUserDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(8) password: string;
  @ApiPropertyOptional({ enum: USER_ROLES }) @IsOptional() @IsIn([...USER_ROLES]) role?: string;
  @ApiPropertyOptional({ enum: ACCESS_LEVELS }) @IsOptional() @IsIn([...ACCESS_LEVELS]) accessLevel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() terminalId?: string;
  @ApiPropertyOptional({ description: 'Vínculo do usuário-entidade (role = entity) → Entity' })
  @IsOptional() @IsString() entityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tacticalManagerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() department?: string;
  // Acesso granular por usuário (tela "Níveis de Acesso" — Fase 4a)
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) allowedModules?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) allowedTerminals?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) allowedOccurrenceTypes?: string[];
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(query: { terminalId?: string; role?: string; status?: UserStatus; page?: number; limit?: number }, user: any) {
    const { terminalId, role, status, page = 1, limit = 20 } = query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = { organizationId: user.organizationId };
    if (terminalId) where.terminalId = terminalId;
    if (role) where.role = role;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { name: 'asc' },
        select: {
          id: true, name: true, email: true, role: true, accessLevel: true, status: true,
          terminalId: true, entityId: true, tacticalManagerId: true,
          allowedModules: true, allowedTerminals: true, allowedOccurrenceTypes: true,
          phone: true, department: true, avatarUrl: true, lastLoginAt: true, createdAt: true,
          terminal: { select: { id: true, name: true } },
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data: items, meta: { total, page: Number(page), limit: Number(limit) } };
  }

  /** Crachá do PAE — contatos ativos da organização, para qualquer papel. */
  async findContacts(requestingUser: any) {
    return this.prisma.user.findMany({
      where: { organizationId: requestingUser.organizationId, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: {
        id: true, name: true, email: true, phone: true, role: true, accessLevel: true,
        terminalId: true,
        terminal: { select: { id: true, name: true, contact: true, responsible: true } },
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, accessLevel: true, status: true,
        terminalId: true, entityId: true, tacticalManagerId: true,
        allowedModules: true, allowedTerminals: true, allowedOccurrenceTypes: true,
        phone: true, department: true, avatarUrl: true, lastLoginAt: true, createdAt: true,
        terminal: { select: { id: true, name: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!user) throw new NotFoundException(`Usuário ${id} não encontrado`);
    return user;
  }

  async create(dto: CreateUserDto, requestingUser: any) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException('E-mail já cadastrado');

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const role = dto.role || 'terminal';
    const isEntity = role === 'entity';

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email.toLowerCase(),
        passwordHash,
        role,
        accessLevel: dto.accessLevel,
        tacticalManagerId: dto.tacticalManagerId,
        allowedModules: dto.allowedModules ?? [],
        allowedTerminals: dto.allowedTerminals ?? [],
        // Padrão: vê TODOS os tipos (vazio = não vê nenhuma ocorrência).
        allowedOccurrenceTypes: dto.allowedOccurrenceTypes ?? [...OCCURRENCE_TYPES],
        status: UserStatus.ACTIVE,
        organizationId: requestingUser.organizationId,
        // Entidade: vincula à Entity (entityId) e NÃO herda terminal.
        terminalId: isEntity ? null : (dto.terminalId || requestingUser.terminalId),
        entityId: isEntity ? (dto.entityId ?? null) : null,
        phone: dto.phone,
        department: dto.department,
      },
      select: {
        id: true, name: true, email: true, role: true, accessLevel: true, status: true, createdAt: true,
      },
    });

    this.logger.log(`User ${user.email} created by ${requestingUser.email}`);
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Usuário ${id} não encontrado`);

    const data: any = {};
    if (dto.name) data.name = dto.name;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.department !== undefined) data.department = dto.department;
    // Papel e vínculo são mutuamente exclusivos: entity usa entityId (sem terminal);
    // terminal/admin usam terminalId (sem entity).
    if (dto.role) {
      data.role = dto.role;
      if (dto.role === 'entity') data.terminalId = null;
      else data.entityId = null;
    }
    if (dto.accessLevel !== undefined) data.accessLevel = dto.accessLevel;
    if (dto.terminalId) data.terminalId = dto.terminalId;
    if (dto.entityId !== undefined) data.entityId = dto.entityId;
    if (dto.tacticalManagerId !== undefined) data.tacticalManagerId = dto.tacticalManagerId;
    if (dto.allowedModules !== undefined) data.allowedModules = dto.allowedModules;
    if (dto.allowedTerminals !== undefined) data.allowedTerminals = dto.allowedTerminals;
    if (dto.allowedOccurrenceTypes !== undefined) data.allowedOccurrenceTypes = dto.allowedOccurrenceTypes;
    if (dto.password) data.passwordHash = await bcrypt.hash(dto.password, 12);

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: {
        id: true, name: true, email: true, role: true, accessLevel: true, status: true,
        terminalId: true, entityId: true, tacticalManagerId: true,
        allowedModules: true, allowedTerminals: true, allowedOccurrenceTypes: true,
        phone: true, department: true,
      },
    });

    return updated;
  }

  async updateStatus(id: string, status: UserStatus) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`Usuário ${id} não encontrado`);

    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, email: true, status: true },
    });
  }

  /**
   * Exclusão permanente (admin) — bloqueada se houver qualquer dado vinculado,
   * para preservar o histórico/auditoria (decisão do gestor, 2026-07-08).
   * Timeline/chat/treinamentos/EPIs registram QUEM fez o quê — excluir o
   * usuário sem checar isso apagaria (ou quebraria) esse rastro.
   */
  async hardDelete(id: string) {
    const found = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Usuário ${id} não encontrado`);

    const [occurrences, timelineEvents, chatMessages, trainings, epis, managedOperators] = await Promise.all([
      this.prisma.occurrence.count({ where: { reportedByUserId: id } }),
      this.prisma.occurrenceTimeline.count({ where: { userId: id } }),
      this.prisma.chatMessage.count({ where: { userId: id } }),
      this.prisma.userTraining.count({ where: { userId: id } }),
      this.prisma.userEpi.count({ where: { userId: id } }),
      this.prisma.user.count({ where: { tacticalManagerId: id } }),
    ]);

    const blockers = ([
      ['ocorrência(s) registrada(s)', occurrences],
      ['evento(s) de timeline', timelineEvents],
      ['mensagem(ns) de chat', chatMessages],
      ['atribuição(ões) de treinamento', trainings],
      ['entrega(s) de EPI', epis],
      ['operacional(is) sob sua gestão', managedOperators],
    ] as [string, number][]).filter(([, count]) => count > 0);

    if (blockers.length) {
      throw new ConflictException(
        `Não é possível excluir: há ${blockers.map(([label, c]) => `${c} ${label}`).join(', ')} vinculado(s) a este usuário. Use "Inativar" para preservar o histórico.`,
      );
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário excluído permanentemente' };
  }
}
