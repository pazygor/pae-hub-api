import { Module } from '@nestjs/common';
import { WarRoomService } from './war-room.service';
import { WarRoomController } from './war-room.controller';

@Module({
  providers: [WarRoomService],
  controllers: [WarRoomController],
  exports: [WarRoomService],
})
export class WarRoomModule {}
