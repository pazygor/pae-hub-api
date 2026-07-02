import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { UsersService, CreateUserDto, UpdateUserDto } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserStatus } from '@prisma/client';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private service: UsersService) {}

  @Get()
  @Roles('admin', 'terminal')
  @ApiOperation({ summary: 'Listar usuários da organização' })
  findAll(
    @Query('terminalId') terminalId?: string,
    @Query('role') role?: string,
    @Query('status') status?: UserStatus,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user?: any,
  ) {
    return this.service.findAll({ terminalId, role, status, page, limit }, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Buscar usuário por ID' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles('admin')
  @ApiOperation({ summary: 'Criar novo usuário' })
  create(@Body() dto: CreateUserDto, @CurrentUser() user: any) {
    return this.service.create(dto, user);
  }

  @Put(':id')
  @Roles('admin')
  @ApiOperation({ summary: 'Atualizar dados do usuário' })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.service.update(id, dto);
  }

  @Put(':id/status')
  @Roles('admin')
  @ApiOperation({ summary: 'Ativar/suspender usuário' })
  updateStatus(@Param('id') id: string, @Body() body: { status: UserStatus }) {
    return this.service.updateStatus(id, body.status);
  }
}
