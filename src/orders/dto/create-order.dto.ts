import { IsNotEmpty, IsString, IsEmail, IsNumber, IsOptional, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class StudentInfoDto {
  @ApiProperty({ example: 'John Doe' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 'STU001' })
  @IsNotEmpty()
  @IsString()
  id: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  @IsEmail()
  email: string;
}

export class CreateOrderDto {
  @ApiProperty({ example: '65b0e6293e9f76a9694d84b4' })
  @IsNotEmpty()
  @IsString()
  school_id: string;

  @ApiProperty({ example: '65b0e552dd31950a9b41c5ba' })
  @IsNotEmpty()
  @IsString()
  trustee_id: string;

  @ApiProperty({ type: StudentInfoDto })
  @ValidateNested()
  @Type(() => StudentInfoDto)
  student_info: StudentInfoDto;

  @ApiProperty({ example: 'PhonePe' })
  @IsNotEmpty()
  @IsString()
  gateway_name: string;

  @ApiProperty({ example: 1000 })
  @IsNumber()
  @Min(1)
  amount: number;

  @ApiProperty({ example: 'Tuition Fee' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 'https://yoursite.com/callback' })
  @IsOptional()
  @IsString()
  callback_url?: string;
}