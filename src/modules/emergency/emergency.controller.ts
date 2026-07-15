import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmergencyService } from './emergency.service';
import {
  CreateOccurrenceDto,
  UpdateOccurrenceDto,
  UpdateOccurrenceStatusDto,
  ActivatePlanDto,
  CreateTimelineEventDto,
  CreateChecklistItemDto,
  UpdateChecklistItemDto,
  CreateEvidenceDto,
  CreateChatMessageDto,
  OccurrenceQueryDto,
} from './dto/occurrence.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Occurrences')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('occurrences')
export class EmergencyController {
  constructor(private service: EmergencyService) {}

  @Get()
  @ApiOperation({ summary: 'Listar ocorrências com filtros' })
  findAll(@Query() query: OccurrenceQueryDto, @CurrentUser() user: any) {
    return this.service.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar ocorrência por ID com timeline, checklist e evidências' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Criar ocorrência (INC-#### sequencial + checklist de 8 passos)' })
  create(@Body() dto: CreateOccurrenceDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Atualizar dados da ocorrência' })
  update(@Param('id') id: string, @Body() dto: UpdateOccurrenceDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Put(':id/status')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Atualizar status (gera evento na timeline; resolvido grava resolvedAt)' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOccurrenceStatusDto, @CurrentUser() user: any) {
    return this.service.updateStatus(id, dto, user);
  }

  @Post(':id/activate-plan')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Ativar um Plano de Ação (aplica o checklist do plano à ocorrência)' })
  activatePlan(@Param('id') id: string, @Body() dto: ActivatePlanDto, @CurrentUser() user: any) {
    return this.service.activatePlan(id, dto.planId, user);
  }

  @Post(':id/timeline')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Registrar evento na timeline imutável (DER §6.3)' })
  addTimelineEvent(@Param('id') id: string, @Body() dto: CreateTimelineEventDto, @CurrentUser() user: any) {
    return this.service.addTimelineEvent(id, dto, user);
  }

  @Post(':id/checklist')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Adicionar item ao checklist da ocorrência' })
  addChecklistItem(@Param('id') id: string, @Body() dto: CreateChecklistItemDto, @CurrentUser() user: any) {
    return this.service.addChecklistItem(id, dto, user);
  }

  @Put(':id/checklist/:itemId')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Marcar/desmarcar item do checklist' })
  updateChecklistItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @CurrentUser() user: any,
  ) {
    return this.service.updateChecklistItem(id, itemId, dto, user);
  }

  @Post(':id/evidences')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Registrar evidência (só metadados — upload real na Fase 6)' })
  addEvidence(@Param('id') id: string, @Body() dto: CreateEvidenceDto, @CurrentUser() user: any) {
    return this.service.addEvidence(id, dto, user);
  }

  @Get(':id/chat')
  @ApiOperation({ summary: 'Mensagens do chat da ocorrência (ChatMessage — DER)' })
  getChatMessages(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.getChatMessages(id, user);
  }

  @Post(':id/chat')
  @ApiOperation({ summary: 'Enviar mensagem no chat (Terminal ↔ Entidades)' })
  addChatMessage(@Param('id') id: string, @Body() dto: CreateChatMessageDto, @CurrentUser() user: any) {
    return this.service.addChatMessage(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Remover ocorrência (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
