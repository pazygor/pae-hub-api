import { Module } from '@nestjs/common';
import { EmergencyService } from './emergency.service';
import { EmergencyController } from './emergency.controller';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  providers: [EmergencyService],
  controllers: [EmergencyController],
  exports: [EmergencyService],
})
export class EmergencyModule {}
