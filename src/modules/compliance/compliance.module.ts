import { Module, Injectable, NotFoundException, ForbiddenException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsDateString, MaxLength, IsArray } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { COMPLIANCE_STATUS } from '../../domain/enums';
import { assertTerminalsForSafetyWrite } from '../../common/helpers/module-enforcement';

// Fase 5b — Itens de conformidade regulatória (Funcional §3.12):
// conforme | atencao | nao_conforme; não-conformidades alimentam os Pendency Alerts.

class CreateComplianceDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  name!: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  responsible!: string;

  @ApiPropertyOptional({ enum: COMPLIANCE_STATUS }) @IsOptional() @IsIn([...COMPLIANCE_STATUS])
  status?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  userId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  notes?: string;

  @ApiPropertyOptional({ isArray: true, description: 'Terminais a que se aplica; vazio = global (nenhum específico)' })
  @IsOptional() @IsArray() @IsString({ each: true })
  terminalIds?: string[];

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100)
  area?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  verificationDate?: string;
}
class UpdateComplianceDto extends PartialType(CreateComplianceDto) {}

@Injectable()
export class ComplianceService {
  constructor(private prisma: PrismaService) {}

  private format(i: any) {
    return {
      id: i.id,
      name: i.name,
      responsible: i.responsible,
      status: i.status,
      expiryDate: i.expiryDate ?? null,
      userId: i.userId ?? null,
      notes: i.notes ?? '',
      terminalIds: i.terminalIds ?? [],
      area: i.area ?? '',
      verificationDate: i.verificationDate ?? null,
    };
  }

  async findAll(user: any) {
    const items = await this.prisma.complianceItem.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((i) => this.format(i));
  }

  async create(dto: CreateComplianceDto, user: any) {
    // Registro compartilhado: valida acesso + módulo de cada terminal (vazio = global admin-only).
    await assertTerminalsForSafetyWrite(this.prisma, user, dto.terminalIds, 'compliance');
    const item = await this.prisma.complianceItem.create({
      data: {
        organizationId: user.organizationId,
        terminalIds: dto.terminalIds ?? [],
        name: dto.name,
        responsible: dto.responsible,
        status: dto.status ?? 'conforme',
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        userId: dto.userId || null,
        notes: dto.notes,
        area: dto.area,
        verificationDate: dto.verificationDate ? new Date(dto.verificationDate) : new Date(),
      },
    });
    return this.format(item);
  }

  async update(id: string, dto: UpdateComplianceDto, user: any) {
    await this.findOwned(id, user);
    // Se mudar os terminais, revalida acesso + módulo (vazio = global admin-only).
    if (dto.terminalIds !== undefined) {
      await assertTerminalsForSafetyWrite(this.prisma, user, dto.terminalIds, 'compliance');
    }
    const { expiryDate, verificationDate, ...fields } = dto;
    const data: any = { ...fields };
    if (expiryDate !== undefined) data.expiryDate = expiryDate ? new Date(expiryDate) : null;
    // Mudança de status sem data explícita registra a verificação de hoje
    data.verificationDate = verificationDate ? new Date(verificationDate) : dto.status ? new Date() : undefined;

    const updated = await this.prisma.complianceItem.update({ where: { id }, data });
    return this.format(updated);
  }

  async remove(id: string, user: any) {
    await this.findOwned(id, user);
    await this.prisma.complianceItem.delete({ where: { id } });
    return { message: 'Item removido' };
  }

  private async findOwned(id: string, user: any) {
    const item = await this.prisma.complianceItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException(`Item ${id} não encontrado`);
    if (item.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    return item;
  }
}

@ApiTags('Compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private service: ComplianceService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  @Roles('admin', 'terminal')
  create(@Body() dto: CreateComplianceDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin', 'terminal')
  update(@Param('id') id: string, @Body() dto: UpdateComplianceDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}

@Module({
  providers: [ComplianceService],
  controllers: [ComplianceController],
})
export class ComplianceModule {}
