import { Module } from '@nestjs/common';
import { EmergencyService } from './emergency.service';
import { EmergencyController } from './emergency.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { FilesModule } from '../files/files.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  // FilesModule: URL assinada dos anexos do chat (item 10). AuditModule: ganchos de
  // auditoria no EmergencyService (item 2) — o merge tinha descartado este import.
  imports: [RealtimeModule, FilesModule, AuditModule],
  providers: [EmergencyService],
  controllers: [EmergencyController],
  exports: [EmergencyService],
})
export class EmergencyModule {}
