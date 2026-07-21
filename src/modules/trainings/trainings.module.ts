import { Module, Injectable, NotFoundException, ForbiddenException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsArray, IsDateString, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { assertTerminalsForSafetyWrite, assertSafetyRecordEditable } from '../../common/helpers/module-enforcement';
import { FilesModule, FilesService } from '../files/files.module';

// Fase 5b — Treinamentos + atribuições por usuário (Funcional §3.10).

class CreateTrainingDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  name!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional() @IsOptional() @IsBoolean()
  mandatory?: boolean;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  materialFileName?: string;

  @ApiPropertyOptional({ description: 'FileAsset do material (upload real — item 4)' })
  @IsOptional() @IsString()
  materialFileId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500)
  videoUrl?: string;

  @ApiPropertyOptional({ isArray: true, description: 'Terminais a que se aplica; vazio = global (todos)' })
  @IsOptional() @IsArray() @IsString({ each: true })
  terminalIds?: string[];
}
class UpdateTrainingDto extends PartialType(CreateTrainingDto) {}

class AssignTrainingDto {
  @ApiProperty({ description: 'Usuários a atribuir (1..N)' }) @IsArray()
  userIds!: string[];

  @ApiPropertyOptional({ description: 'Default: hoje' }) @IsOptional() @IsDateString()
  completedDate?: string;

  @ApiPropertyOptional({ description: 'Default: +1 ano' }) @IsOptional() @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255)
  certificate?: string;
}

@Injectable()
export class TrainingsService {
  constructor(private prisma: PrismaService, private files: FilesService) {}

  private async format(t: any) {
    return {
      id: t.id,
      name: t.name,
      description: t.description ?? '',
      mandatory: t.mandatory,
      materialFileName: t.materialFileName ?? undefined,
      materialFileId: t.materialFileId ?? undefined,
      // URL assinada do material (item 4). Só quando há arquivo real.
      materialUrl: t.materialFileId ? await this.files.readUrl(t.materialFileId) : undefined,
      videoUrl: t.videoUrl ?? undefined,
      terminalIds: t.terminalIds ?? [],
    };
  }

  private formatAssignment(ut: any) {
    return {
      id: ut.id,
      trainingId: ut.trainingId,
      userId: ut.userId,
      completedDate: ut.completedDate,
      expiryDate: ut.expiryDate,
      certificate: ut.certificate ?? undefined,
    };
  }

  async findAll(user: any) {
    const trainings = await this.prisma.training.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    return Promise.all(trainings.map((t) => this.format(t)));
  }

  async findAssignments(user: any) {
    const assignments = await this.prisma.userTraining.findMany({
      where: { training: { organizationId: user.organizationId } },
      orderBy: { createdAt: 'asc' },
    });
    return assignments.map((ut) => this.formatAssignment(ut));
  }

  async create(dto: CreateTrainingDto, user: any) {
    // Registro compartilhado: valida acesso + módulo de cada terminal (vazio = global admin-only).
    await assertTerminalsForSafetyWrite(this.prisma, user, dto.terminalIds, 'trainings');
    const training = await this.prisma.training.create({
      data: {
        organizationId: user.organizationId,
        terminalIds: dto.terminalIds ?? [],
        name: dto.name,
        description: dto.description ?? '',
        mandatory: dto.mandatory ?? false,
        materialFileName: dto.materialFileName,
        materialFileId: dto.materialFileId,
        videoUrl: dto.videoUrl,
      },
    });
    return this.format(training);
  }

  async update(id: string, dto: UpdateTrainingDto, user: any) {
    const current = await this.findOwned(id, user);
    // Registro órfão (todos os terminais perderam o módulo) é só-leitura.
    await assertSafetyRecordEditable(this.prisma, current.terminalIds, 'trainings');
    if (dto.terminalIds !== undefined) {
      const before: string[] = current.terminalIds ?? [];
      const added = dto.terminalIds.filter((t) => !before.includes(t));
      if (dto.terminalIds.length === 0) {
        // Virou global (todos os terminais): exclusivo do admin.
        await assertTerminalsForSafetyWrite(this.prisma, user, [], 'trainings');
      } else if (added.length > 0) {
        // Só os terminais ADICIONADOS precisam ter o módulo; manter um vínculo
        // preexistente não pode travar a edição.
        await assertTerminalsForSafetyWrite(this.prisma, user, added, 'trainings');
      }
    }

    const updated = await this.prisma.training.update({ where: { id }, data: { ...dto } });
    return this.format(updated);
  }

  async remove(id: string, user: any) {
    await this.findOwned(id, user);
    // Assignments caem em cascata (onDelete: Cascade)
    await this.prisma.training.delete({ where: { id } });
    return { message: 'Treinamento removido' };
  }

  async assign(id: string, dto: AssignTrainingDto, user: any) {
    await this.findOwned(id, user);
    const completedDate = dto.completedDate ? new Date(dto.completedDate) : new Date();
    const expiryDate = dto.expiryDate
      ? new Date(dto.expiryDate)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    // Ignora usuários que já têm atribuição vigente deste treinamento
    const existing = await this.prisma.userTraining.findMany({
      where: { trainingId: id, userId: { in: dto.userIds }, expiryDate: { gte: new Date() } },
      select: { userId: true },
    });
    const skip = new Set(existing.map((e) => e.userId));
    const toCreate = dto.userIds.filter((uid) => !skip.has(uid));

    const created: any[] = [];
    for (const userId of toCreate) {
      created.push(
        await this.prisma.userTraining.create({
          data: { trainingId: id, userId, completedDate, expiryDate, certificate: dto.certificate },
        }),
      );
    }
    return created.map((ut) => this.formatAssignment(ut));
  }

  async removeAssignment(assignmentId: string, user: any) {
    const ut = await this.prisma.userTraining.findUnique({
      where: { id: assignmentId },
      include: { training: { select: { organizationId: true } } },
    });
    if (!ut) throw new NotFoundException(`Atribuição ${assignmentId} não encontrada`);
    if (ut.training.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    await this.prisma.userTraining.delete({ where: { id: assignmentId } });
    return { message: 'Atribuição removida' };
  }

  private async findOwned(id: string, user: any) {
    const training = await this.prisma.training.findUnique({ where: { id } });
    if (!training) throw new NotFoundException(`Treinamento ${id} não encontrado`);
    if (training.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    return training;
  }
}

@ApiTags('Trainings')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trainings')
export class TrainingsController {
  constructor(private service: TrainingsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Get('assignments')
  findAssignments(@CurrentUser() user: any) {
    return this.service.findAssignments(user);
  }

  @Post()
  @Roles('admin', 'terminal')
  create(@Body() dto: CreateTrainingDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Post(':id/assignments')
  @Roles('admin', 'terminal')
  assign(@Param('id') id: string, @Body() dto: AssignTrainingDto, @CurrentUser() user: any) {
    return this.service.assign(id, dto, user);
  }

  @Delete('assignments/:assignmentId')
  @Roles('admin', 'terminal')
  removeAssignment(@Param('assignmentId') assignmentId: string, @CurrentUser() user: any) {
    return this.service.removeAssignment(assignmentId, user);
  }

  // Declarado depois de 'assignments/:assignmentId' para a rota específica casar primeiro.
  @Put(':id')
  @Roles('admin', 'terminal')
  update(@Param('id') id: string, @Body() dto: UpdateTrainingDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}

@Module({
  imports: [FilesModule],
  providers: [TrainingsService],
  controllers: [TrainingsController],
})
export class TrainingsModule {}
