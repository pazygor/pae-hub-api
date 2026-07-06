import { Controller, Get, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { EntityNotificationsService } from './entity-notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ENTITY_NOTIFICATION_STATUS } from '../../domain/enums';

class UpdateNotificationStatusDto {
  @ApiProperty({ enum: ENTITY_NOTIFICATION_STATUS })
  @IsIn([...ENTITY_NOTIFICATION_STATUS])
  status!: string;
}

@ApiTags('EntityNotifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('entity-notifications')
export class EntityNotificationsController {
  constructor(private service: EntityNotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar notificações de entidades (filtro por ocorrência)' })
  findAll(@Query('occurrenceId') occurrenceId: string | undefined, @CurrentUser() user: any) {
    return this.service.findAll(occurrenceId, user);
  }

  @Put(':id/status')
  @Roles('admin')
  @ApiOperation({ summary: 'Avançar status: Notificada → Em Atendimento → Confirmada' })
  updateStatus(@Param('id') id: string, @Body() dto: UpdateNotificationStatusDto, @CurrentUser() user: any) {
    return this.service.updateStatus(id, dto.status, user);
  }
}
