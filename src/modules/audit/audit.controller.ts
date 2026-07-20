import { Controller, Get, Post, Body, Query, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString } from 'class-validator';
import type { Request } from 'express';
import { AuditService } from './audit.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { clientIp } from '../../common/utils/client-ip';

/** Registro de VISUALIZAÇÃO — só ações de leitura whitelisted (evita forjar trilha). */
class LogViewDto {
  @ApiProperty({ enum: ['open_situation_room'] }) @IsIn(['open_situation_room']) action: string;
  @ApiProperty({ enum: ['occurrence'] }) @IsIn(['occurrence']) resource: string;
  @ApiProperty() @IsString() resourceId: string;
}

@ApiTags('Audit')
@ApiBearerAuth()
@Controller('audit')
export class AuditController {
  constructor(private service: AuditService) {}

  // ── Central de Auditoria (admin) ──────────────────────────────────────────
  @Get('access')
  @Roles('admin')
  @ApiOperation({ summary: 'Sessões de acesso (item 1) — login/logout/duração' })
  access(
    @Query('userId') userId?: string,
    @Query('terminalId') terminalId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('status') status?: 'ativa' | 'encerrada' | 'expirada',
    @Query('limit') limit?: string,
  ) {
    return this.service.listAccess({ userId, terminalId, from, to, status, limit });
  }

  @Get('access/stats')
  @Roles('admin')
  @ApiOperation({ summary: 'KPIs de acesso (item 1)' })
  accessStats(@Query('from') from?: string, @Query('to') to?: string, @Query('terminalId') terminalId?: string) {
    return this.service.accessStats({ from, to, terminalId });
  }

  @Get('activity')
  @Roles('admin')
  @ApiOperation({ summary: 'Trilha de atividade (item 2) — ações sobre recursos' })
  activity(
    @Query('userId') userId?: string,
    @Query('terminalId') terminalId?: string,
    @Query('resource') resource?: string,
    @Query('action') action?: string,
    @Query('resourceId') resourceId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listActivity({ userId, terminalId, resource, action, resourceId, from, to, limit });
  }

  @Get('activity/stats')
  @Roles('admin')
  @ApiOperation({ summary: 'KPIs de atividade (item 2)' })
  activityStats(@Query('from') from?: string, @Query('to') to?: string, @Query('terminalId') terminalId?: string) {
    return this.service.activityStats({ from, to, terminalId });
  }

  // ── Registro de abertura-chave (qualquer autenticado; ex.: Sala de Situação) ──
  @Post('view')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Registra uma abertura-chave (leitura) na trilha de atividade' })
  async view(@Body() dto: LogViewDto, @CurrentUser() user: any, @Req() req: Request) {
    await this.service.recordView({
      userId: user?.id,
      action: dto.action,
      resource: dto.resource,
      resourceId: dto.resourceId,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    return { ok: true };
  }
}
