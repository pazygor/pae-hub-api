import { IsString, IsOptional, IsIn, IsNumber, IsNotEmpty, MaxLength, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { TERMINAL_STATUS, PRODUCT_MODULE, SAFETY_SUBMODULE } from '../../../domain/enums';

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

  // Endereço estruturado (CEP-autofill + geocodificação)
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(9) cep?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(255) street?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(20) number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) neighborhood?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2) state?: string;

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

// Item 7 — pacotes/módulos do terminal. `compliance` é ignorada (derivada).
export class UpdateTerminalModulesDto {
  @ApiProperty({ isArray: true, enum: PRODUCT_MODULE, description: 'Pacotes ativos' })
  @IsArray() @IsIn([...PRODUCT_MODULE], { each: true })
  activeModules!: string[];

  @ApiPropertyOptional({ isArray: true, enum: SAFETY_SUBMODULE, description: 'Sub-módulos de Safety (trainings/epis). Conformidade é derivada.' })
  @IsOptional() @IsArray() @IsIn([...SAFETY_SUBMODULE], { each: true })
  activeSafetySubModules?: string[];
}
