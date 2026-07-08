import { Module, Injectable, NotFoundException, ForbiddenException, BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength, IsDateString } from 'class-validator';
import { PartialType } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { tenantScope, resolveTerminalId, userCanAccessTerminal } from '../../common/helpers/tenant-scope';
import { RISK_LEVEL } from '../../domain/enums';

// Fase 5a — Inventário de riscos por terminal e área (DER §6.1 / Funcional §3.7).

class CreateRiskDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(100)
  type!: string;

  @ApiProperty() @IsString() @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ enum: RISK_LEVEL }) @IsOptional() @IsIn([...RISK_LEVEL])
  level?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  affectedArea?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  date?: string;

  @ApiPropertyOptional({ description: 'Obrigatório para admin' }) @IsOptional() @IsString()
  terminalId?: string;
}
class UpdateRiskDto extends PartialType(CreateRiskDto) {}

@Injectable()
export class RisksService {
  constructor(private prisma: PrismaService) {}

  private format(r: any) {
    return {
      id: r.id,
      terminalId: r.terminalId,
      terminalName: r.terminal?.name,
      type: r.type,
      description: r.description,
      level: r.level,
      affectedArea: r.affectedArea ?? '',
      date: r.date,
    };
  }

  async findAll(user: any) {
    const where = await tenantScope(this.prisma, user);
    const risks = await this.prisma.risk.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { terminal: { select: { name: true } } },
    });
    return risks.map((r) => this.format(r));
  }

  async create(dto: CreateRiskDto, user: any) {
    const terminalId = await resolveTerminalId(this.prisma, user, dto.terminalId);
    if (!terminalId) throw new BadRequestException('Terminal inválido para esta organização');
    const risk = await this.prisma.risk.create({
      data: {
        organizationId: user.organizationId,
        terminalId,
        type: dto.type,
        description: dto.description,
        level: dto.level ?? 'médio',
        affectedArea: dto.affectedArea,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
      include: { terminal: { select: { name: true } } },
    });
    return this.format(risk);
  }

  async update(id: string, dto: UpdateRiskDto, user: any) {
    const risk = await this.findOwned(id, user);
    const { terminalId: _t, date, ...fields } = dto;
    const updated = await this.prisma.risk.update({
      where: { id: risk.id },
      data: { ...fields, ...(date ? { date: new Date(date) } : {}) },
      include: { terminal: { select: { name: true } } },
    });
    return this.format(updated);
  }

  async remove(id: string, user: any) {
    const risk = await this.findOwned(id, user);
    await this.prisma.risk.delete({ where: { id: risk.id } });
    return { message: 'Risco removido' };
  }

  private async findOwned(id: string, user: any) {
    const risk = await this.prisma.risk.findUnique({ where: { id } });
    if (!risk) throw new NotFoundException(`Risco ${id} não encontrado`);
    if (risk.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    if (user.role !== 'admin' && !userCanAccessTerminal(user, risk.terminalId)) throw new ForbiddenException('Acesso negado');
    return risk;
  }
}

@ApiTags('Risks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('risks')
export class RisksController {
  constructor(private service: RisksService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  @Roles('admin', 'terminal')
  create(@Body() dto: CreateRiskDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin', 'terminal')
  update(@Param('id') id: string, @Body() dto: UpdateRiskDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}

@Module({
  providers: [RisksService],
  controllers: [RisksController],
})
export class RisksModule {}
