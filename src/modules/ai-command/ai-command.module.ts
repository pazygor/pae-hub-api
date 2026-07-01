import { Module } from '@nestjs/common';
import { AiCommandService } from './ai-command.service';
import { AiCommandController } from './ai-command.controller';

@Module({
  providers: [AiCommandService],
  controllers: [AiCommandController],
  exports: [AiCommandService],
})
export class AiCommandModule {}
