import { IsString, IsOptional, IsEnum, IsNumber, IsUUID, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OccurrenceType, OccurrenceSeverity, OccurrenceCriticality, OccurrenceStatus } from '@prisma/client';

export class CreateOccurrenceDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(255)
  title: string;

  @ApiProperty()
  @IsString() @IsNotEmpty()
  description: string;

  @ApiPropertyOptional({ enum: OccurrenceType })
  @IsOptional() @IsEnum(OccurrenceType)
  type?: OccurrenceType;

  @ApiPropertyOptional({ enum: OccurrenceSeverity })
  @IsOptional() @IsEnum(OccurrenceSeverity)
  severity?: OccurrenceSeverity;

  @ApiPropertyOptional({ enum: OccurrenceCriticality })
  @IsOptional() @IsEnum(OccurrenceCriticality)
  criticality?: OccurrenceCriticality;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  longitude?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  emergencyTypeId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsUUID()
  assignedToUserId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  terminalId?: string;
}

export class UpdateOccurrenceDto extends PartialType(CreateOccurrenceDto) {}

export class UpdateOccurrenceStatusDto {
  @ApiProperty({ enum: OccurrenceStatus })
  @IsEnum(OccurrenceStatus)
  status: OccurrenceStatus;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  comment?: string;
}

export class AddTimelineEventDto {
  @ApiProperty()
  @IsString() @IsNotEmpty()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: Record<string, any>;
}

export class OccurrenceQueryDto {
  @ApiPropertyOptional({ enum: OccurrenceStatus })
  @IsOptional() @IsEnum(OccurrenceStatus)
  status?: OccurrenceStatus;

  @ApiPropertyOptional({ enum: OccurrenceSeverity })
  @IsOptional() @IsEnum(OccurrenceSeverity)
  severity?: OccurrenceSeverity;

  @ApiPropertyOptional({ enum: OccurrenceType })
  @IsOptional() @IsEnum(OccurrenceType)
  type?: OccurrenceType;

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
