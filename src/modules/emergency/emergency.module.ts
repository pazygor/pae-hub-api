import { Module } from '@nestjs/common';
import { EmergencyService } from './emergency.service';
import { EmergencyController } from './emergency.controller';
import { RealtimeModule } from '../realtime/realtime.module';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [RealtimeModule, FilesModule], // FilesModule: URL assinada dos anexos do chat (item 10)
  providers: [EmergencyService],
  controllers: [EmergencyController],
  exports: [EmergencyService],
})
export class EmergencyModule {}
