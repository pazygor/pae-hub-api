import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEntityDto, UpdateEntityDto } from './dto/entity.dto';

@Injectable()
export class EntitiesService {
  private readonly logger = new Logger(EntitiesService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    const items = await this.prisma.entity.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
    });
    return { data: items.map(this.format), meta: { total: items.length } };
  }

  async findOne(id: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id } });
    if (!entity) throw new NotFoundException(`Entidade ${id} não encontrada`);
    return this.format(entity);
  }

  async create(dto: CreateEntityDto, user: any) {
    const entity = await this.prisma.entity.create({
      data: {
        organizationId: user.organizationId,
        name: dto.name,
        type: dto.type,
        contact: dto.contact,
        status: dto.status || 'Ativo',
      },
    });
    this.logger.log(`Entidade ${entity.name} criada por ${user.email}`);
    return this.format(entity);
  }

  async update(id: string, dto: UpdateEntityDto) {
    await this.ensureExists(id);
    const entity = await this.prisma.entity.update({
      where: { id },
      data: { name: dto.name, type: dto.type, contact: dto.contact, status: dto.status },
    });
    return this.format(entity);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    // Soft delete (consistente com terminais/usuários).
    await this.prisma.entity.update({ where: { id }, data: { status: 'Inativo' } });
    return { message: 'Entidade inativada com sucesso' };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.entity.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Entidade ${id} não encontrada`);
  }

  private format(e: any) {
    return { id: e.id, name: e.name, type: e.type, contact: e.contact ?? '', status: e.status };
  }
}
