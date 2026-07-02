import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { WarRoomService } from './war-room.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { WarRoomStatus } from '@prisma/client';

@ApiTags('War Room')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('war-rooms')
export class WarRoomController {
  constructor(private service: WarRoomService) {}

  @Get()
  @ApiOperation({ summary: 'Listar War Rooms' })
  findAll(
    @Query('occurrenceId') occurrenceId?: string,
    @Query('status') status?: WarRoomStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: any,
  ) {
    return this.service.findAll({ occurrenceId, status, page, limit }, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar War Room por ID com mensagens e decisões' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Abrir nova War Room para uma ocorrência' })
  create(@Body() dto: { occurrenceId: string; title?: string }, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Post(':id/messages')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Enviar mensagem na War Room' })
  addMessage(@Param('id') id: string, @Body() body: { content: string }, @CurrentUser() user: any) {
    return this.service.addMessage(id, body.content, user);
  }

  @Post(':id/decisions')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Registrar decisão na War Room' })
  addDecision(@Param('id') id: string, @Body() body: { description: string }, @CurrentUser() user: any) {
    return this.service.addDecision(id, body.description, user);
  }

  @Put(':id/close')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Encerrar War Room' })
  close(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() user: any) {
    return this.service.close(id, body.reason, user);
  }
}
