import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { IsString, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';
import { NotificationRulesService } from './notification-rules.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

class CreateRuleDto {
  @IsString() @IsNotEmpty() occurrenceType: string;
  @IsString() @IsNotEmpty() entityId: string;
  @IsOptional() @IsBoolean() mandatory?: boolean;
}

class SetMandatoryDto {
  @IsBoolean() mandatory: boolean;
}

@ApiTags('Notification Rules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notification-rules')
export class NotificationRulesController {
  constructor(private service: NotificationRulesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar regras de acionamento de entidades' })
  findAll(@CurrentUser() user: any) {
    return this.service.findAll(user);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Criar regra de acionamento' })
  create(@Body() dto: CreateRuleDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Alterar obrigatoriedade da regra' })
  setMandatory(@Param('id') id: string, @Body() dto: SetMandatoryDto) {
    return this.service.setMandatory(id, dto.mandatory);
  }

  @Delete(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Remover regra de acionamento' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
