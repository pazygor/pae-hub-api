import { Module, Injectable, NotFoundException, ForbiddenException, BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsArray, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { tenantScope, resolveTerminalId } from '../../common/helpers/tenant-scope';
import { PLAN_STATUS } from '../../domain/enums';

// Fase 5a — Planos de Ação PAE com checklist executável (DER §6.1 / Funcional §3.6).

class CreatePlanDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  name!: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  responsible?: string;

  @ApiPropertyOptional({ description: '[{ text, done }]' }) @IsOptional() @IsArray()
  checklist?: { text: string; done: boolean }[];

  @ApiPropertyOptional({ enum: PLAN_STATUS }) @IsOptional() @IsIn([...PLAN_STATUS])
  status?: string;

  @ApiPropertyOptional({ description: 'Obrigatório para admin' }) @IsOptional() @IsString()
  terminalId?: string;
}
class UpdatePlanDto extends PartialType(CreatePlanDto) {}

@Injectable()
export class EmergencyPlansService {
  constructor(private prisma: PrismaService) {}

  private format(p: any) {
    return {
      id: p.id,
      terminalId: p.terminalId,
      terminalName: p.terminal?.name,
      name: p.name,
      description: p.description,
      responsible: p.responsible ?? '',
      checklist: Array.isArray(p.checklist) ? p.checklist : [],
      status: p.status,
    };
  }

  async findAll(user: any) {
    const where = await tenantScope(this.prisma, user);
    const plans = await this.prisma.emergencyPlan.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: { terminal: { select: { name: true } } },
    });
    return plans.map((p) => this.format(p));
  }

  async create(dto: CreatePlanDto, user: any) {
    const terminalId = await resolveTerminalId(this.prisma, user, dto.terminalId);
    if (!terminalId) throw new BadRequestException('Terminal inválido para esta organização');
    const plan = await this.prisma.emergencyPlan.create({
      data: {
        organizationId: user.organizationId,
        terminalId,
        name: dto.name,
        description: dto.description,
        responsible: dto.responsible,
        checklist: this.sanitizeChecklist(dto.checklist),
        status: dto.status ?? 'ativo',
      },
      include: { terminal: { select: { name: true } } },
    });
    return this.format(plan);
  }

  async update(id: string, dto: UpdatePlanDto, user: any) {
    const plan = await this.findOwned(id, user);
    const { terminalId: _t, checklist, ...fields } = dto;
    const updated = await this.prisma.emergencyPlan.update({
      where: { id: plan.id },
      data: {
        ...fields,
        ...(checklist !== undefined ? { checklist: this.sanitizeChecklist(checklist) } : {}),
      },
      include: { terminal: { select: { name: true } } },
    });
    return this.format(updated);
  }

  async remove(id: string, user: any) {
    const plan = await this.findOwned(id, user);
    await this.prisma.emergencyPlan.delete({ where: { id: plan.id } });
    return { message: 'Plano removido' };
  }

  /** Garante o shape [{ text: string, done: boolean }] no Json. */
  private sanitizeChecklist(checklist?: { text: string; done: boolean }[]) {
    if (!Array.isArray(checklist)) return [];
    return checklist
      .filter((i) => i && typeof i.text === 'string' && i.text.trim())
      .map((i) => ({ text: String(i.text).slice(0, 255), done: !!i.done }));
  }

  private async findOwned(id: string, user: any) {
    const plan = await this.prisma.emergencyPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException(`Plano ${id} não encontrado`);
    if (plan.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    if (user.role === 'terminal' && plan.terminalId !== user.terminalId) throw new ForbiddenException('Acesso negado');
    return plan;
  }
}

@ApiTags('EmergencyPlans')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('plans')
export class EmergencyPlansController {
  constructor(private service: EmergencyPlansService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  @Roles('admin', 'terminal')
  create(@Body() dto: CreatePlanDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin', 'terminal')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}

@Module({
  providers: [EmergencyPlansService],
  controllers: [EmergencyPlansController],
})
export class EmergencyPlansModule {}
