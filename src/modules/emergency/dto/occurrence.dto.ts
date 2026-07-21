import { IsString, IsOptional, IsIn, IsNumber, IsNotEmpty, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  OCCURRENCE_STATUS,
  OCCURRENCE_CRITICALITY,
  SEVERITY_LEVEL,
  TIMELINE_EVENT_TYPE,
} from '../../../domain/enums';

// Vocabulário pt-BR do DER §6.3 — validado na borda, sem tradução (plano §4.2).

export class CreateOccurrenceDto {
  @ApiProperty({ description: 'Tipo de ocorrência (ex.: Princípio de incêndio)' })
  @IsString() @IsNotEmpty() @MaxLength(100)
  type!: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ enum: OCCURRENCE_STATUS })
  @IsOptional() @IsIn([...OCCURRENCE_STATUS])
  status?: string;

  @ApiPropertyOptional({ enum: OCCURRENCE_CRITICALITY })
  @IsOptional() @IsIn([...OCCURRENCE_CRITICALITY])
  criticality?: string;

  @ApiPropertyOptional({ enum: SEVERITY_LEVEL })
  @IsOptional() @IsIn([...SEVERITY_LEVEL])
  severity?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(255)
  responsible?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(255)
  team?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(255)
  location?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ description: 'Obrigatório para admin; usuários de terminal usam o próprio' })
  @IsOptional() @IsString()
  terminalId?: string;
}

export class UpdateOccurrenceDto extends PartialType(CreateOccurrenceDto) {}

export class UpdateOccurrenceStatusDto {
  @ApiProperty({ enum: OCCURRENCE_STATUS })
  @IsIn([...OCCURRENCE_STATUS])
  status!: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  comment?: string;
}

export class ActivatePlanDto {
  @ApiProperty({ description: 'ID do plano de ação (ativo, do terminal da ocorrência) a ativar' })
  @IsString() @IsNotEmpty()
  planId!: string;
}

export class CreateTimelineEventDto {
  @ApiProperty({ enum: TIMELINE_EVENT_TYPE })
  @IsIn([...TIMELINE_EVENT_TYPE])
  type!: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  description!: string;

  @ApiPropertyOptional({ description: 'Nome do arquivo anexado (placeholder — upload real na Fase 6)' })
  @IsOptional() @IsString() @MaxLength(255)
  attachment?: string;
}

export class CreateChecklistItemDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(255)
  text!: string;
}

export class UpdateChecklistItemDto {
  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}

export class CreateEvidenceDto {
  @ApiProperty({ description: 'Nome do arquivo (só metadados na Fase 2)' })
  @IsString() @IsNotEmpty() @MaxLength(255)
  filename!: string;

  @ApiPropertyOptional({ description: 'foto | vídeo | documento | áudio | outro' })
  @IsOptional() @IsIn(['foto', 'vídeo', 'documento', 'áudio', 'outro'])
  type?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;
}

// Item 10 (chat rico): mensagem = texto (legenda) e/ou anexo. Pelo menos um dos dois
// (validado no service). `fileId` referencia um FileAsset criado via POST /api/files.
export class CreateChatMessageDto {
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  message?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @IsNotEmpty()
  fileId?: string; // cuid do FileAsset (item 4) — não é UUID
}

export class OccurrenceQueryDto {
  @ApiPropertyOptional({ enum: OCCURRENCE_STATUS })
  @IsOptional() @IsIn([...OCCURRENCE_STATUS])
  status?: string;

  @ApiPropertyOptional({ enum: OCCURRENCE_CRITICALITY })
  @IsOptional() @IsIn([...OCCURRENCE_CRITICALITY])
  criticality?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  type?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  terminalId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;
}
