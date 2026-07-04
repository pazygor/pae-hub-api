import { IsString, IsOptional, IsIn, IsNumber, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TERMINAL_STATUS } from '../../../domain/enums';

export class CreateTerminalDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(255)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(50)
  code?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  responsible?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  contact?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({ enum: TERMINAL_STATUS })
  @IsOptional() @IsIn([...TERMINAL_STATUS])
  status?: string;
}

export class UpdateTerminalDto extends PartialType(CreateTerminalDto) {}
