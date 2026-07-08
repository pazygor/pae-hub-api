import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';

@Injectable()
export class TerminalsService {
  private readonly logger = new Logger(TerminalsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Terminais visíveis (regra "Terminais Visíveis" de Níveis de Acesso):
   * - admin: todos da organização (ou os marcados, se a lista estiver preenchida);
   * - não-admin: os terminais marcados (não-vazio); senão, o terminal-casa
   *   (`terminal`) ou nenhum (`entity` sem lista).
   * Como `Terminal` é o próprio tenant, o filtro é por `id`.
   */
  async findAll(user: any) {
    const where: any = { organizationId: user.organizationId };
    const allowed: string[] = user.allowedTerminals ?? [];

    if (user.role === 'terminal') {
      // casa sempre visível + adicionais liberados
      const ids = [...new Set([user.terminalId, ...allowed].filter(Boolean))];
      where.id = { in: ids.length ? ids : ['__none__'] };
    } else if (user.role === 'entity') {
      where.id = { in: allowed.length ? allowed : ['__none__'] };
    } else if (allowed.length) {
      // admin: a lista (se preenchida) apenas estreita
      where.id = { in: allowed };
    }

    const items = await this.prisma.terminal.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return { data: items.map(this.format), meta: { total: items.length } };
  }

  async findOne(id: string) {
    const terminal = await this.prisma.terminal.findUnique({ where: { id } });
    if (!terminal) throw new NotFoundException(`Terminal ${id} não encontrado`);
    return this.format(terminal);
  }

  async create(dto: CreateTerminalDto, user: any) {
    const code = dto.code || (await this.generateCode(user.organizationId));
    const terminal = await this.prisma.terminal.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        code,
        description: dto.description,
        location: this.composeLocation(dto),
        cep: dto.cep, street: dto.street, number: dto.number,
        neighborhood: dto.neighborhood, city: dto.city, state: dto.state,
        responsible: dto.responsible,
        contact: dto.contact,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: dto.status || 'Ativo',
      },
    });
    this.logger.log(`Terminal ${terminal.code} criado por ${user.email}`);
    return this.format(terminal);
  }

  async update(id: string, dto: UpdateTerminalDto) {
    await this.ensureExists(id);
    const terminal = await this.prisma.terminal.update({
      where: { id },
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        location: this.composeLocation(dto),
        cep: dto.cep, street: dto.street, number: dto.number,
        neighborhood: dto.neighborhood, city: dto.city, state: dto.state,
        responsible: dto.responsible,
        contact: dto.contact,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: dto.status,
      },
    });
    return this.format(terminal);
  }

  /** Endereço legível composto dos campos estruturados (fallback: dto.location). */
  private composeLocation(dto: Partial<CreateTerminalDto>): string | undefined {
    const parts = [dto.street, dto.number, dto.neighborhood, dto.city, dto.state].filter(Boolean);
    return parts.length ? parts.join(', ') : dto.location;
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // Soft delete: mantém integridade com ocorrências/usuários vinculados.
    await this.prisma.terminal.update({
      where: { id },
      data: { status: 'Inativo', isActive: false },
    });
    return { message: 'Terminal inativado com sucesso' };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.terminal.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Terminal ${id} não encontrado`);
  }

  private async generateCode(organizationId: string): Promise<string> {
    const count = await this.prisma.terminal.count({ where: { organizationId } });
    return `T${String(count + 1).padStart(2, '0')}`;
  }

  /** Formato alinhado ao tipo `Terminal` do front (lat/lng). */
  private format(t: any) {
    return {
      id: t.id,
      name: t.name,
      code: t.code,
      responsible: t.responsible ?? '',
      contact: t.contact ?? '',
      location: t.location ?? '',
      cep: t.cep ?? '',
      street: t.street ?? '',
      number: t.number ?? '',
      neighborhood: t.neighborhood ?? '',
      city: t.city ?? '',
      state: t.state ?? '',
      lat: t.latitude,
      lng: t.longitude,
      status: t.status,
    };
  }
}
