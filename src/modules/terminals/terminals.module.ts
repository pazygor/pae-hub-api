import { Module } from '@nestjs/common';
import { TerminalsService } from './terminals.service';
import { TerminalsController } from './terminals.controller';

@Module({
  providers: [TerminalsService],
  controllers: [TerminalsController],
  exports: [TerminalsService],
})
export class TerminalsModule {}
