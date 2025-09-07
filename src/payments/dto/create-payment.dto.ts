import { 
  IsNotEmpty, 
  IsNumber, 
  IsString, 
  IsOptional, 
  IsEmail, 
  ValidateNested,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';

class StudentInfoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  id: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  class?: string;

  @IsOptional()
  @IsString()
  section?: string;
}

export class CreatePaymentDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @ValidateNested()
  @Type(() => StudentInfoDto)
  studentInfo: StudentInfoDto;

  @IsOptional()
  @IsString()
  feeType?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  gateway?: string;

  @IsOptional()
  @IsString()
  returnUrl?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}