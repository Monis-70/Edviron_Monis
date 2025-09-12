import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  BadRequestException,
  Logger,
  Req,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { Request } from 'express';
import { Public } from '../auth/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);

  constructor(private readonly paymentsService: PaymentsService) {}

  // ✅ Create payment (delegates to service)
  @Post('create-payment')
  @Public()
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    try {
      return await this.paymentsService.createPayment(createPaymentDto);
    } catch (error: any) {
      this.logger.error(
        'Payment API Error:',
        error.response?.data || error.message,
      );
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
  @Public()
  async getPaymentStatus(@Param('customOrderId') customOrderId: string) {
    return this.paymentsService.getPaymentStatus(customOrderId);
  }

  @Post('webhook')
  async handleWebhook(@Req() req: Request) {
    const payload = req.body;
    this.logger.log('Webhook received:', JSON.stringify(payload));

    const incoming = payload.order_info ?? payload;
    const orderId =
      incoming.order_id ||
      incoming.collect_request_id ||
      incoming.custom_order_id;

    if (!orderId) {
      throw new BadRequestException('Invalid webhook payload - missing order id');
    }

    // Normalize status
    const status =
      incoming.status || payload.status || incoming.payment_status || 'PENDING';

    // Call service update
    const updated = await this.paymentsService.updatePaymentStatus(
      orderId,
      status,
      incoming,
    );

    // If updatePaymentStatus returned null → order not found
    if (!updated) {
      return {
        success: false,
        message: 'Order not found',
        orderId,
      };
    }

    return {
      success: true,
      order: {
        orderId: updated._id?.toString() ?? orderId, // Mongo _id
        custom_order_id: updated.custom_order_id ?? orderId, // internal ID
        provider_collect_id: updated.provider_collect_id ?? null, // external gateway ID
        status: updated.status,
        amount: updated.transaction_amount ?? updated.order_amount ?? 0,
        paymentMode: updated.payment_mode ?? 'N/A',
        bankReference: updated.bank_reference ?? 'N/A',
        paymentMessage: updated.payment_message ?? '',
        paymentTime: updated.payment_time ?? new Date(),
      },
    };
  }
}
