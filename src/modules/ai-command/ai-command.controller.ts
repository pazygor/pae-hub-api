import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AiCommandService } from './ai-command.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AiAgentType } from '@prisma/client';

@ApiTags('AI Command')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiCommandController {
  constructor(private service: AiCommandService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Enviar mensagem ao AI Command' })
  chat(
    @Body() dto: { message: string; occurrenceId?: string; context?: string },
    @CurrentUser() user: any,
  ) {
    return this.service.chat(dto, user);
  }

  @Get('insights')
  @ApiOperation({ summary: 'Listar insights gerados pelos agentes de IA' })
  getInsights(
    @Query('occurrenceId') occurrenceId?: string,
    @Query('agentType') agentType?: AiAgentType,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: any,
  ) {
    return this.service.getInsights({ occurrenceId, agentType, page, limit }, user);
  }

  @Get('knowledge')
  @ApiOperation({ summary: 'Buscar na base de conhecimento' })
  getKnowledge(
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.service.getKnowledge({ type, search, page, limit });
  }
}
