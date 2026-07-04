import { Controller, Get, Put, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsArray, IsString } from 'class-validator';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

class SetPermissionDto {
  @IsArray() @IsString({ each: true })
  terminalIds: string[];
}

@ApiTags('Permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private service: PermissionsService) {}

  @Get()
  @ApiOperation({ summary: 'Matriz de permissões entidade × terminais' })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Put(':entityId')
  @Roles('admin')
  @ApiOperation({ summary: 'Definir terminais que a entidade atende' })
  setForEntity(@Param('entityId') entityId: string, @Body() dto: SetPermissionDto) {
    return this.service.setForEntity(entityId, dto.terminalIds);
  }
}
