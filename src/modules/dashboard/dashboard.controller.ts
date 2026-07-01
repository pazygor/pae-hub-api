import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Dashboard')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private service: DashboardService) {}

  @Get('kpis')
  @ApiOperation({ summary: 'KPIs gerais da plataforma' })
  getKpis(@Query('terminalId') terminalId?: string, @CurrentUser() user?: any) {
    return this.service.getKpis(terminalId || user?.terminalId, user?.organizationId);
  }

  @Get('cop-indicators')
  @ApiOperation({ summary: 'Indicadores em tempo real para o COP' })
  getCopIndicators(@Query('terminalId') terminalId?: string, @CurrentUser() user?: any) {
    return this.service.getCopIndicators(terminalId || user?.terminalId);
  }
}
