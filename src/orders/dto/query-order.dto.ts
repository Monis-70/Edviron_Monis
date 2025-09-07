import { IsOptional, IsString, IsNumber, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryOrderDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'success' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: '65b0e6293e9f76a9694d84b4' })
  @IsOptional()
  @IsString()
  school_id?: string;

  @ApiPropertyOptional({ example: 'PhonePe' })
  @IsOptional()
  @IsString()
  gateway?: string;

  @ApiPropertyOptional({ example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  end_date?: string;

  @ApiPropertyOptional({ example: '-createdAt' })
  @IsOptional()
  @IsString()
  sort?: string = '-createdAt';

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  search?: string;
}
