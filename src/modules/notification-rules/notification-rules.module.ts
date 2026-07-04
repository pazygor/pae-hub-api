import { Module } from '@nestjs/common';
import { NotificationRulesService } from './notification-rules.service';
import { NotificationRulesController } from './notification-rules.controller';

@Module({
  providers: [NotificationRulesService],
  controllers: [NotificationRulesController],
  exports: [NotificationRulesService],
})
export class NotificationRulesModule {}
