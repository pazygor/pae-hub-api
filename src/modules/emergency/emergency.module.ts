import { Module } from '@nestjs/common';
import { EmergencyService } from './emergency.service';
import { EmergencyController } from './emergency.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [RealtimeModule, AuditModule],
  providers: [EmergencyService],
  controllers: [EmergencyController],
  exports: [EmergencyService],
})
export class EmergencyModule {}
