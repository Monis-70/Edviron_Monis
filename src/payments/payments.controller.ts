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
@Public() // 👈 add if you want it accessible without JWT
async handleWebhook(@Req() req: Request) {
  // 🔐 Secure with secret
  const webhookSecret = process.env.WEBHOOK_SECRET;
  const incomingSecret = req.headers['x-webhook-secret'];

  if (webhookSecret && incomingSecret !== webhookSecret) {
    throw new BadRequestException('Invalid webhook secret');
  }

  const payload = req.body;
  this.logger.debug('Webhook received:', JSON.stringify(payload));

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
    (incoming.status || payload.status || incoming.payment_status || 'PENDING').toLowerCase();

  // Call service update
  const updated = await this.paymentsService.updatePaymentStatus(
    orderId,
    status,
    incoming,
  );

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
      orderId: updated._id?.toString() ?? orderId,
      custom_order_id: updated.custom_order_id ?? orderId,
      provider_collect_id: updated.provider_collect_id ?? null,
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
