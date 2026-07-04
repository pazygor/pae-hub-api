import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';

@Injectable()
export class TerminalsService {
  private readonly logger = new Logger(TerminalsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Terminais visíveis: admin vê todos da organização; demais papéis veem
   * apenas o terminal vinculado. (Entidades ganharão visibilidade por
   * Permission na Fase 4b.)
   */
  async findAll(user: any) {
    const where: any = { organizationId: user.organizationId };
    if (user.role !== 'admin') {
      where.id = user.terminalId ?? '__none__';
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
        location: dto.location,
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
        location: dto.location,
        responsible: dto.responsible,
        contact: dto.contact,
        latitude: dto.latitude,
        longitude: dto.longitude,
        status: dto.status,
      },
    });
    return this.format(terminal);
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
      lat: t.latitude,
      lng: t.longitude,
      status: t.status,
    };
  }
}
