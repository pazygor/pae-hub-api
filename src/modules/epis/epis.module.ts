import { Module, Injectable, NotFoundException, ForbiddenException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsArray, IsDateString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { EPI_TYPE, EPI_USAGE_STATUS } from '../../domain/enums';
import { assertTerminalsForSafetyWrite, assertSafetyRecordEditable } from '../../common/helpers/module-enforcement';

// Fase 5b — EPIs + ciclo de vida das entregas (Funcional §3.11):
// entregue → em_uso → devolvido | vencido | substituido.

class CreateEpiDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ enum: EPI_TYPE }) @IsIn([...EPI_TYPE])
  epiType!: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional({ isArray: true, description: 'Terminais a que se aplica; vazio = global (todos)' })
  @IsOptional() @IsArray() @IsString({ each: true })
  terminalIds?: string[];
}
class UpdateEpiDto extends PartialType(CreateEpiDto) {}

class DeliverEpiDto {
  @ApiProperty({ description: 'Usuários que recebem o EPI (1..N)' }) @IsArray()
  userIds!: string[];

  @ApiPropertyOptional({ description: 'Default: hoje' }) @IsOptional() @IsDateString()
  deliveryDate?: string;

  @ApiPropertyOptional({ description: 'Default: validade do EPI' }) @IsOptional() @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  responsible?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  observations?: string;
}

class UpdateDeliveryDto {
  @ApiPropertyOptional({ enum: EPI_USAGE_STATUS }) @IsOptional() @IsIn([...EPI_USAGE_STATUS])
  usageStatus?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  observations?: string;
}

@Injectable()
export class EpisService {
  constructor(private prisma: PrismaService) {}

  private format(e: any) {
    return {
      id: e.id,
      name: e.name,
      description: e.description ?? '',
      epiType: e.epiType,
      expiryDate: e.expiryDate ?? null,
      terminalIds: e.terminalIds ?? [],
    };
  }

  private formatDelivery(ue: any) {
    return {
      id: ue.id,
      epiId: ue.epiId,
      userId: ue.userId,
      deliveryDate: ue.deliveryDate,
      expiryDate: ue.expiryDate ?? null,
      responsible: ue.responsible ?? '',
      observations: ue.observations ?? '',
      usageStatus: ue.usageStatus,
      returnDate: ue.returnDate ?? undefined,
    };
  }

  async findAll(user: any) {
    const epis = await this.prisma.epi.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return epis.map((e) => this.format(e));
  }

  async findDeliveries(user: any) {
    const deliveries = await this.prisma.userEpi.findMany({
      where: { epi: { organizationId: user.organizationId } },
      orderBy: { createdAt: 'asc' },
    });
    return deliveries.map((ue) => this.formatDelivery(ue));
  }

  async create(dto: CreateEpiDto, user: any) {
    // Registro compartilhado: valida acesso + módulo de cada terminal (vazio = global admin-only).
    await assertTerminalsForSafetyWrite(this.prisma, user, dto.terminalIds, 'epis');
    const epi = await this.prisma.epi.create({
      data: {
        organizationId: user.organizationId,
        terminalIds: dto.terminalIds ?? [],
        name: dto.name,
        description: dto.description ?? '',
        epiType: dto.epiType,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      },
    });
    return this.format(epi);
  }

  async update(id: string, dto: UpdateEpiDto, user: any) {
    const current = await this.findOwned(id, user);
    // Registro órfão (todos os terminais perderam o módulo) é só-leitura.
    await assertSafetyRecordEditable(this.prisma, current.terminalIds, 'epis');
    if (dto.terminalIds !== undefined) {
      const before: string[] = current.terminalIds ?? [];
      const added = dto.terminalIds.filter((t) => !before.includes(t));
      if (dto.terminalIds.length === 0) {
        // Virou global (todos os terminais): exclusivo do admin.
        await assertTerminalsForSafetyWrite(this.prisma, user, [], 'epis');
      } else if (added.length > 0) {
        // Só os terminais ADICIONADOS precisam ter o módulo. Manter um vínculo que
        // já existia não pode travar a edição se o módulo foi desligado depois.
        await assertTerminalsForSafetyWrite(this.prisma, user, added, 'epis');
      }
    }
    const { expiryDate, ...fields } = dto;
    const data: any = { ...fields };
    if (expiryDate !== undefined) data.expiryDate = expiryDate ? new Date(expiryDate) : null;

    const updated = await this.prisma.epi.update({ where: { id }, data });
    return this.format(updated);
  }

  async remove(id: string, user: any) {
    await this.findOwned(id, user);
    await this.prisma.epi.delete({ where: { id } });
    return { message: 'EPI removido' };
  }

  async deliver(id: string, dto: DeliverEpiDto, user: any) {
    const epi = await this.findOwned(id, user);
    const deliveryDate = dto.deliveryDate ? new Date(dto.deliveryDate) : new Date();
    const expiryDate = dto.expiryDate ? new Date(dto.expiryDate) : epi.expiryDate;

    // Ignora usuários que já têm entrega ativa deste EPI
    const existing = await this.prisma.userEpi.findMany({
      where: { epiId: id, userId: { in: dto.userIds }, usageStatus: { notIn: ['substituido', 'devolvido'] } },
      select: { userId: true },
    });
    const skip = new Set(existing.map((e) => e.userId));
    const toCreate = dto.userIds.filter((uid) => !skip.has(uid));

    const created: any[] = [];
    for (const userId of toCreate) {
      created.push(
        await this.prisma.userEpi.create({
          data: {
            epiId: id,
            userId,
            deliveryDate,
            expiryDate,
            responsible: dto.responsible ?? user.name,
            observations: dto.observations,
            usageStatus: 'em_uso',
          },
        }),
      );
    }
    return created.map((ue) => this.formatDelivery(ue));
  }

  async updateDelivery(deliveryId: string, dto: UpdateDeliveryDto, user: any) {
    const ue = await this.findOwnedDelivery(deliveryId, user);
    const data: any = {};
    if (dto.usageStatus) {
      data.usageStatus = dto.usageStatus;
      // Devolução/substituição fecham o ciclo com a data de retorno
      if (dto.usageStatus === 'devolvido' || dto.usageStatus === 'substituido') data.returnDate = new Date();
    }
    if (dto.expiryDate) data.expiryDate = new Date(dto.expiryDate);
    if (dto.observations !== undefined) data.observations = dto.observations;

    const updated = await this.prisma.userEpi.update({ where: { id: ue.id }, data });
    return this.formatDelivery(updated);
  }

  async removeDelivery(deliveryId: string, user: any) {
    const ue = await this.findOwnedDelivery(deliveryId, user);
    await this.prisma.userEpi.delete({ where: { id: ue.id } });
    return { message: 'Entrega removida' };
  }

  private async findOwned(id: string, user: any) {
    const epi = await this.prisma.epi.findUnique({ where: { id } });
    if (!epi) throw new NotFoundException(`EPI ${id} não encontrado`);
    if (epi.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    return epi;
  }

  private async findOwnedDelivery(id: string, user: any) {
    const ue = await this.prisma.userEpi.findUnique({
      where: { id },
      include: { epi: { select: { organizationId: true } } },
    });
    if (!ue) throw new NotFoundException(`Entrega ${id} não encontrada`);
    if (ue.epi.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    return ue;
  }
}

@ApiTags('EPIs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('epis')
export class EpisController {
  constructor(private service: EpisService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Get('deliveries')
  findDeliveries(@CurrentUser() user: any) {
    return this.service.findDeliveries(user);
  }

  @Post()
  @Roles('admin', 'terminal')
  create(@Body() dto: CreateEpiDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Post(':id/deliveries')
  @Roles('admin', 'terminal')
  deliver(@Param('id') id: string, @Body() dto: DeliverEpiDto, @CurrentUser() user: any) {
    return this.service.deliver(id, dto, user);
  }

  @Put('deliveries/:deliveryId')
  @Roles('admin', 'terminal')
  updateDelivery(@Param('deliveryId') deliveryId: string, @Body() dto: UpdateDeliveryDto, @CurrentUser() user: any) {
    return this.service.updateDelivery(deliveryId, dto, user);
  }

  @Delete('deliveries/:deliveryId')
  @Roles('admin', 'terminal')
  removeDelivery(@Param('deliveryId') deliveryId: string, @CurrentUser() user: any) {
    return this.service.removeDelivery(deliveryId, user);
  }

  // Declarado depois de 'deliveries/:deliveryId' para a rota específica casar primeiro.
  @Put(':id')
  @Roles('admin', 'terminal')
  update(@Param('id') id: string, @Body() dto: UpdateEpiDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}

@Module({
  providers: [EpisService],
  controllers: [EpisController],
})
export class EpisModule {}
