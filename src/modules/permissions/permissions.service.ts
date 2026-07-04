import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private prisma: PrismaService) {}

  /** Retorna a matriz [{ entityId, terminalIds }] das entidades da organização. */
  async findAll(user: any) {
    const items = await this.prisma.permission.findMany({
      where: { entity: { organizationId: user.organizationId } },
    });
    return {
      data: items.map(p => ({ entityId: p.entityId, terminalIds: p.terminalIds })),
      meta: { total: items.length },
    };
  }

  /** Define (upsert) os terminais que uma entidade atende. */
  async setForEntity(entityId: string, terminalIds: string[]) {
    const perm = await this.prisma.permission.upsert({
      where: { entityId },
      update: { terminalIds },
      create: { entityId, terminalIds },
    });
    this.logger.log(`Permissões da entidade ${entityId}: ${terminalIds.length} terminal(is)`);
    return { entityId: perm.entityId, terminalIds: perm.terminalIds };
  }
}
