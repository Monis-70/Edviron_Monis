import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-payment')
  @UseGuards(JwtAuthGuard)
  async createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: any,
  ) {
    return this.paymentsService.createPayment(createPaymentDto, user.userId);
  }

  @Get('status/:customOrderId')
  @UseGuards(JwtAuthGuard)
  async getPaymentStatus(@Param('customOrderId') customOrderId: string) {
    return this.paymentsService.getPaymentStatus(customOrderId);
  }
}