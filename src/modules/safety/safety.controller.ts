import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SafetyService } from './safety.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SafetyItemType, SafetyItemStatus } from '@prisma/client';

@ApiTags('Safety')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('safety')
export class SafetyController {
  constructor(private service: SafetyService) {}

  @Get()
  @ApiOperation({ summary: 'Listar itens de segurança' })
  findAll(
    @Query('type') type?: SafetyItemType,
    @Query('status') status?: SafetyItemStatus,
    @Query('terminalId') terminalId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: any,
  ) {
    return this.service.findAll({ type, status, terminalId, page, limit }, user);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Resumo de segurança por status' })
  getSummary(@Query('terminalId') terminalId?: string) {
    return this.service.getSummary(terminalId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar item de segurança por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'Criar item de segurança' })
  create(@Body() dto: any, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Atualizar item de segurança' })
  update(@Param('id') id: string, @Body() dto: any, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }
}
