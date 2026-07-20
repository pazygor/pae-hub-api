import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

@Module({
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService], // consumido pelo EmergencyModule (ganchos do item 2)
})
export class AuditModule {}
