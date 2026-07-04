import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TerminalsService } from './terminals.service';
import { CreateTerminalDto, UpdateTerminalDto } from './dto/terminal.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Terminals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('terminals')
export class TerminalsController {
  constructor(private service: TerminalsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar terminais visíveis ao usuário' })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar terminal por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Criar terminal' })
  create(@Body() dto: CreateTerminalDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Atualizar terminal' })
  update(@Param('id') id: string, @Body() dto: UpdateTerminalDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Inativar terminal (soft delete)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
