import { Module } from '@nestjs/common';
import { EntityNotificationsService } from './entity-notifications.service';
import { EntityNotificationsController } from './entity-notifications.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  providers: [EntityNotificationsService],
  controllers: [EntityNotificationsController],
})
export class EntityNotificationsModule {}
