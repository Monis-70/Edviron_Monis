import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-payment')
  @UseGuards(JwtAuthGuard)
  async createPayment(
    @Body() createPaymentDto: CreatePaymentDto,
    @CurrentUser() user: any,
  ) {
    try {
      // Add school_id from env and generate JWT sign
      const schoolId = process.env.SCHOOL_ID;
      const callbackUrl =
        createPaymentDto.returnUrl || `${process.env.FRONTEND_URL}/payments/status`;

      if (!process.env.PG_KEY) {
        throw new BadRequestException('Payment gateway key (PG_KEY) is missing');
      }

      const sign = jwt.sign(
        {
          school_id: schoolId,
          amount: createPaymentDto.amount.toString(),
          callback_url: callbackUrl,
        },
        process.env.PG_KEY,
        { algorithm: 'HS256' },
      );

      // Prepare payload for external payment API
      const apiPayload = {
        school_id: schoolId,
        amount: createPaymentDto.amount.toString(),
        callback_url: callbackUrl,
        sign,
      };

      // Call the external payment API
      const response = await axios.post(
        'https://dev-vanilla.edviron.com/erp/create-collect-request',
        apiPayload,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.API_KEY}`,
          },
        },
      );

      const data = response.data;

      this.logger.log(`Payment initiated successfully for user ${user.userId}`);

      // Optionally save order details via service
      await this.paymentsService.createPayment(createPaymentDto);

      // Return response to frontend
      return {
        success: true,
        paymentUrl: data.Collect_request_url,
        orderId: data.collect_request_id,
        sign: data.sign,
      };
    } catch (error: any) {
      this.logger.error('Payment API Error:', error.response?.data || error.message);
      throw new BadRequestException(
        error.response?.data?.message || 'Failed to create payment',
      );
    }
  }

  @Get('collect-payment/:customOrderId')
  async collectPayment(@Param('customOrderId') customOrderId: string) {
    return this.paymentsService.collectPaymentStatus(customOrderId);
  }

  @Get('status/:customOrderId')
  @UseGuards(JwtAuthGuard)
  async getPaymentStatus(@Param('customOrderId') customOrderId: string) {
    return this.paymentsService.getPaymentStatus(customOrderId);
  }
}
