import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationRulesService {
  private readonly logger = new Logger(NotificationRulesService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(user: any) {
    const items = await this.prisma.notificationRule.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return { data: items.map(this.format), meta: { total: items.length } };
  }

  async create(dto: { occurrenceType: string; entityId: string; mandatory?: boolean }, user: any) {
    const exists = await this.prisma.notificationRule.findFirst({
      where: { organizationId: user.organizationId, occurrenceType: dto.occurrenceType, entityId: dto.entityId },
    });
    if (exists) throw new ConflictException('Já existe uma regra para esta entidade e tipo de ocorrência');

    const rule = await this.prisma.notificationRule.create({
      data: {
        organizationId: user.organizationId,
        occurrenceType: dto.occurrenceType,
        entityId: dto.entityId,
        mandatory: dto.mandatory ?? false,
      },
    });
    this.logger.log(`Regra de acionamento criada: ${dto.occurrenceType} → ${dto.entityId}`);
    return this.format(rule);
  }

  async setMandatory(id: string, mandatory: boolean) {
    await this.ensureExists(id);
    const rule = await this.prisma.notificationRule.update({ where: { id }, data: { mandatory } });
    return this.format(rule);
  }

  async remove(id: string) {
    await this.ensureExists(id);
    await this.prisma.notificationRule.delete({ where: { id } });
    return { message: 'Regra removida com sucesso' };
  }

  private async ensureExists(id: string) {
    const found = await this.prisma.notificationRule.findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new NotFoundException(`Regra ${id} não encontrada`);
  }

  private format(r: any) {
    return { id: r.id, occurrenceType: r.occurrenceType, entityId: r.entityId, mandatory: r.mandatory };
  }
}
