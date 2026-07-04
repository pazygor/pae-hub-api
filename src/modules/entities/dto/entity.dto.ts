import { IsString, IsOptional, IsIn, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ENTITY_STATUS } from '../../../domain/enums';

export class CreateEntityDto {
  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(255)
  name: string;

  @ApiProperty()
  @IsString() @IsNotEmpty() @MaxLength(100)
  type: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString() @MaxLength(100)
  contact?: string;

  @ApiPropertyOptional({ enum: ENTITY_STATUS })
  @IsOptional() @IsIn([...ENTITY_STATUS])
  status?: string;
}

export class UpdateEntityDto extends PartialType(CreateEntityDto) {}
