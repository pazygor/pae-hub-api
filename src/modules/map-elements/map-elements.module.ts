import { Module, Injectable, NotFoundException, ForbiddenException, BadRequestException, Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsIn, IsNumber, MaxLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { tenantScope, resolveTerminalId, userCanAccessTerminal } from '../../common/helpers/tenant-scope';
import { MAP_LAYER_TYPE } from '../../domain/enums';

// Fase 5a — Elementos do Mapa de Emergência (DER §6.3 / Funcional §3.5):
// equipamentos, hidrantes, rotas de evacuação, áreas de risco, pontos de encontro.

class CreateMapElementDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(255)
  name!: string;

  @ApiProperty({ enum: MAP_LAYER_TYPE }) @IsIn([...MAP_LAYER_TYPE])
  layerType!: string;

  @ApiProperty() @IsNumber()
  lat!: number;

  @ApiProperty() @IsNumber()
  lng!: number;

  @ApiPropertyOptional() @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Obrigatório para admin' }) @IsOptional() @IsString()
  terminalId?: string;
}
class UpdateMapElementDto extends PartialType(CreateMapElementDto) {}

@Injectable()
export class MapElementsService {
  constructor(private prisma: PrismaService) {}

  private format(el: any) {
    return {
      id: el.id,
      terminalId: el.terminalId,
      name: el.name,
      layerType: el.layerType,
      lat: el.latitude,
      lng: el.longitude,
      description: el.description ?? '',
    };
  }

  async findAll(user: any) {
    const where = await tenantScope(this.prisma, user);
    const elements = await this.prisma.mapElement.findMany({ where, orderBy: { createdAt: 'asc' } });
    return elements.map((el) => this.format(el));
  }

  async create(dto: CreateMapElementDto, user: any) {
    const terminalId = await resolveTerminalId(this.prisma, user, dto.terminalId);
    if (!terminalId) throw new BadRequestException('Terminal inválido para esta organização');
    const el = await this.prisma.mapElement.create({
      data: {
        organizationId: user.organizationId,
        terminalId,
        name: dto.name,
        layerType: dto.layerType,
        latitude: dto.lat,
        longitude: dto.lng,
        description: dto.description,
      },
    });
    return this.format(el);
  }

  async update(id: string, dto: UpdateMapElementDto, user: any) {
    const el = await this.findOwned(id, user);
    const { terminalId: _t, lat, lng, ...fields } = dto;
    const updated = await this.prisma.mapElement.update({
      where: { id: el.id },
      data: {
        ...fields,
        ...(lat !== undefined ? { latitude: lat } : {}),
        ...(lng !== undefined ? { longitude: lng } : {}),
      },
    });
    return this.format(updated);
  }

  async remove(id: string, user: any) {
    const el = await this.findOwned(id, user);
    await this.prisma.mapElement.delete({ where: { id: el.id } });
    return { message: 'Elemento removido' };
  }

  private async findOwned(id: string, user: any) {
    const el = await this.prisma.mapElement.findUnique({ where: { id } });
    if (!el) throw new NotFoundException(`Elemento ${id} não encontrado`);
    if (el.organizationId !== user.organizationId) throw new ForbiddenException('Acesso negado');
    if (user.role !== 'admin' && !userCanAccessTerminal(user, el.terminalId)) throw new ForbiddenException('Acesso negado');
    return el;
  }
}

@ApiTags('MapElements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('map-elements')
export class MapElementsController {
  constructor(private service: MapElementsService) {}

  @Get()
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  @Roles('admin', 'terminal')
  create(@Body() dto: CreateMapElementDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin', 'terminal')
  update(@Param('id') id: string, @Body() dto: UpdateMapElementDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user);
  }

  @Delete(':id')
  @Roles('admin', 'terminal')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user);
  }
}

@Module({
  providers: [MapElementsService],
  controllers: [MapElementsController],
})
export class MapElementsModule {}
