import { IsOptional, IsEnum, IsString, IsDateString, IsNumber } from 'class-validator';

export class TransactionFiltersDto {
  @IsOptional()
  @IsEnum(['pending', 'processing', 'success', 'failed', 'cancelled'])
  status?: string;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  // New optional fields for pagination & sorting
  @IsOptional()
  @IsNumber()
  page?: number;

  @IsOptional()
  @IsNumber()
  limit?: number;

  @IsOptional()
  @IsString()
  sort?: string; // e.g., 'created_at', 'amount'

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  order?: 'asc' | 'desc';
}
