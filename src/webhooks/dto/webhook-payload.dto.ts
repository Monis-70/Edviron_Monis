import {
  IsNumber,
  IsObject,
  ValidateNested,
  IsString,
  IsOptional,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

class OrderInfoDto {
  @IsString()
  order_id: string;

  @IsNumber()
  order_amount: number;

  @IsNumber()
  transaction_amount: number;

  @IsString()
  gateway: string;

  @IsString()
  @IsOptional()
  bank_reference?: string;

  @IsString()
  status: string; // success | pending | failed | cancelled etc.

  @IsString()
  payment_mode: string;

  @IsString()
  @IsOptional()
  payment_details?: string;

  @IsString()
  @IsOptional()
  payment_message?: string;

  @IsDateString()
  payment_time: string; // ISO date string

  @IsString()
  @IsOptional()
  error_message?: string;
}

export class WebhookPayloadDto {
  @IsNumber()
  status: number; // top-level numeric status (keep if required by your validation)

  @ValidateNested()
  @Type(() => OrderInfoDto)
  order_info: OrderInfoDto;
}
