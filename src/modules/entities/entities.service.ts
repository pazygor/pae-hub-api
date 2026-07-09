import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
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

  /**
   * Exclusão permanente (admin) — bloqueada se houver qualquer dado vinculado,
   * para preservar o histórico/auditoria (decisão do gestor, 2026-07-08).
   * Permission/NotificationRule/EntityNotification têm onDelete: Cascade no
   * schema — sem este bloqueio, excluiriam o histórico de acionamento em
   * emergências reais sem aviso.
   */
  async hardDelete(id: string) {
    await this.ensureExists(id);

    const [permission, rules, notifications] = await Promise.all([
      this.prisma.permission.count({ where: { entityId: id } }),
      this.prisma.notificationRule.count({ where: { entityId: id } }),
      this.prisma.entityNotification.count({ where: { entityId: id } }),
    ]);

    const blockers = ([
      ['permissão(ões) de terminal', permission],
      ['regra(s) de acionamento', rules],
      ['notificação(ões) de emergência já disparada(s)', notifications],
    ] as [string, number][]).filter(([, count]) => count > 0);

    if (blockers.length) {
      throw new ConflictException(
        `Não é possível excluir: há ${blockers.map(([label, c]) => `${c} ${label}`).join(', ')} vinculado(s) a esta entidade. Use "Inativar" para preservar o histórico.`,
      );
    }

    await this.prisma.entity.delete({ where: { id } });
    return { message: 'Entidade excluída permanentemente' };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.entity.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Entidade ${id} não encontrada`);
  }

  private format(e: any) {
    return { id: e.id, name: e.name, type: e.type, contact: e.contact ?? '', status: e.status };
  }
}
