import { Module, Injectable, NotFoundException, ForbiddenException, BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { tenantScope, resolveTerminalId, userCanAccessTerminal } from '../../common/helpers/tenant-scope';
import { DOCUMENT_TYPE } from '../../domain/enums';
import { FilesModule, FilesService } from '../files/files.module';

// Fase 5a — Biblioteca de documentos PAE (DER §6.1 / Funcional §3.8).
// Arquivo real via FileAsset (item 4); `fileName` é o rótulo de exibição.

class CreateDocumentDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  title!: string;

  @ApiProperty({ enum: DOCUMENT_TYPE }) @IsIn([...DOCUMENT_TYPE])
  docType!: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  fileName!: string;

  @ApiPropertyOptional({ description: 'FileAsset do arquivo real (item 4)' })
  @IsOptional() @IsString()
  fileId?: string;

  @ApiPropertyOptional({ description: 'Obrigatório para admin' }) @IsOptional() @IsString()
  terminalId?: string;
}
class UpdateDocumentDto extends PartialType(CreateDocumentDto) {}

@Injectable()
export class PaeDocumentsService {
  constructor(private prisma: PrismaService, private files: FilesService) {}

  private async format(d: any) {
    return {
      id: d.id,
      terminalId: d.terminalId,
      terminalName: d.terminal?.name,
      title: d.title,
      docType: d.docType,
      description: d.description ?? '',
      fileName: d.fileName,
      fileId: d.fileId ?? undefined,
      // URL assinada do arquivo (item 4). Só quando há arquivo real.
      fileUrl: d.fileId ? await this.files.readUrl(d.fileId) : undefined,
      uploadDate: d.createdAt,
      userName: d.uploadedBy ?? '—',
    };
  }

  async findAll(user: any) {
    const where = await tenantScope(this.prisma, user);
    const docs = await this.prisma.pAEDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { terminal: { select: { name: true } } },
    });
    return Promise.all(docs.map((d) => this.format(d)));
  }

  async create(dto: CreateDocumentDto, user: any) {
    const terminalId = await resolveTerminalId(this.prisma, user, dto.terminalId);
    if (!terminalId) throw new BadRequestException('Terminal inválido para esta organização');
    const doc = await this.prisma.pAEDocument.create({
      data: {
        organizationId: user.organizationId,
        terminalId,
        title: dto.title,
        docType: dto.docType,
        description: dto.description,
        fileName: dto.fileName,
        fileId: dto.fileId,
        uploadedBy: user.name,
      },
      include: { terminal: { select: { name: true } } },
    });
    return this.format(doc);
  }

  async update(id: string, dto: UpdateDocumentDto, user: any) {
    const doc = await this.findOwned(id, user);
    const { terminalId: _t, ...fields } = dto;
    const updated = await this.prisma.pAEDocument.update({
      where: { id: doc.id },
      data: fields,
      include: { terminal: { select: { name: true } } },
    });
    return this.format(updated);
  }

  async remove(id: string, user: any) {
    const doc = await this.findOwned(id, user);
    await this.prisma.pAEDocument.delete({ where: { id: doc.id } });
    return { message: 'Documento removido' };
  }

  private async findOwned(id: string, user: any) {
    const doc = await this.prisma.pAEDocument.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Documento ${id} não encontrado`);
    if (doc.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    if (user.role !== 'admin' && !userCanAccessTerminal(user, doc.terminalId)) throw new ForbiddenException('Acesso negado');
    return doc;
  }
}

@ApiTags('PAEDocuments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class PaeDocumentsController {
  constructor(private service: PaeDocumentsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  @Roles('admin', 'terminal')
  create(@Body() dto: CreateDocumentDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin', 'terminal')
  update(@Param('id') id: string, @Body() dto: UpdateDocumentDto, @CurrentUser() user: any) {
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
  providers: [PaeDocumentsService],
  controllers: [PaeDocumentsController],
})
export class PaeDocumentsModule {}
