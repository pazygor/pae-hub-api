import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TerminalsModule } from './modules/terminals/terminals.module';
import { EntitiesModule } from './modules/entities/entities.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { NotificationRulesModule } from './modules/notification-rules/notification-rules.module';
import { EntityNotificationsModule } from './modules/entity-notifications/entity-notifications.module';
import { RisksModule } from './modules/risks/risks.module';
import { EmergencyPlansModule } from './modules/emergency-plans/emergency-plans.module';
import { MapElementsModule } from './modules/map-elements/map-elements.module';
import { PaeDocumentsModule } from './modules/pae-documents/pae-documents.module';
import { EmergencyModule } from './modules/emergency/emergency.module';
import { AlertsModule } from './modules/alerts/alerts.module';
import { WarRoomModule } from './modules/war-room/war-room.module';
import { SafetyModule } from './modules/safety/safety.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { AiCommandModule } from './modules/ai-command/ai-command.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    PrismaModule,
    AuthModule,
    UsersModule,
    TerminalsModule,
    EntitiesModule,
    PermissionsModule,
    NotificationRulesModule,
    EntityNotificationsModule,
    RisksModule,
    EmergencyPlansModule,
    MapElementsModule,
    PaeDocumentsModule,
    EmergencyModule,
    AlertsModule,
    WarRoomModule,
    SafetyModule,
    DashboardModule,
    AiCommandModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
  ],
})
export class AppModule {}
