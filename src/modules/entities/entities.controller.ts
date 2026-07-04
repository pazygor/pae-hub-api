import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EntitiesService } from './entities.service';
import { CreateEntityDto, UpdateEntityDto } from './dto/entity.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Entities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('entities')
export class EntitiesController {
  constructor(private service: EntitiesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar entidades externas da organização' })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar entidade por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Cadastrar entidade' })
  create(@Body() dto: CreateEntityDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Atualizar entidade' })
  update(@Param('id') id: string, @Body() dto: UpdateEntityDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Inativar entidade (soft delete)' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
