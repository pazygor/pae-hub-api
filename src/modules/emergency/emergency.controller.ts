import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmergencyService } from './emergency.service';
import { CreateOccurrenceDto, UpdateOccurrenceDto, UpdateOccurrenceStatusDto, OccurrenceQueryDto } from './dto/occurrence.dto';
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
  @ApiOperation({ summary: 'Buscar ocorrência por ID com timeline e evidências' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.findOne(id, user);
  }

  @Post()
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Criar nova ocorrência' })
  create(@Body() dto: CreateOccurrenceDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Atualizar ocorrência' })
  update(@Param('id') id: string, @Body() dto: UpdateOccurrenceDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Put(':id/status')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Atualizar status da ocorrência' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOccurrenceStatusDto, @CurrentUser() user: any) {
    return this.service.updateStatus(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Remover ocorrência (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}
