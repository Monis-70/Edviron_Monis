import { IsNumber, IsObject, ValidateNested, IsString, IsOptional } from 'class-validator';
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
  status: string;

  @IsString()
  payment_mode: string;

  @IsString()
  @IsOptional()
  payemnt_details?: string;

  @IsString()
  @IsOptional()
  payment_details?: string;

  @IsString()
  @IsOptional()
  Payment_message?: string;

  @IsString()
  @IsOptional()
  payment_message?: string;

  @IsString()
  payment_time: string;

  @IsString()
  @IsOptional()
  error_message?: string;
}

export class WebhookPayloadDto {
  @IsNumber()
  status: number;

  @ValidateNested()
  @Type(() => OrderInfoDto)
  order_info: OrderInfoDto;
}