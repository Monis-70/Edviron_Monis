import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Ip,
  Query,
  UseGuards,
  BadRequestException,
  Param,
  Res,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/current-user.decorator';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';

@Controller('webhook')
export class WebhooksController {
  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly configService: ConfigService,
  ) {}

  // ✅ Payment gateway calls this
  @Post()
  @Public()
  async handleWebhook(
    @Body() payload: any,
    @Headers() headers: any,
    @Ip() ip: string,
    @Res() res: Response,
  ) {
    if (!payload) {
      throw new BadRequestException('Empty webhook payload');
    }

    // Process webhook → update DB
    await this.webhooksService.processWebhook(payload, headers, ip);

    // ✅ Normalize orderId from multiple possible fields
    const orderId =
      payload.order_id ||
      payload.collect_request_id ||
      payload.custom_order_id ||
      payload.data?.order_id;

    // ✅ Always redirect user to frontend status page
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:5173';
   // return res.redirect(`${frontendUrl}/payments/status/${orderId}`);
   return { success: true, orderId, message: 'Webhook processed' };


  }

  // ✅ Protected: view logs
  @Get('logs')
  @UseGuards(JwtAuthGuard)
  async getWebhookLogs(@Query() filters: any) {
    return this.webhooksService.getWebhookLogs(filters);
  }

  // ✅ Protected: retry failed
  @Post('retry')
  @UseGuards(JwtAuthGuard)
  async retryFailedWebhooks() {
    return this.webhooksService.retryFailedWebhooks();
  }

  // ✅ NEW: Get payment status for frontend
  @Get('/status/:orderId')
  async getPaymentStatus(@Param('orderId') orderId: string) {
    return this.webhooksService.getOrderStatus(orderId);
  }
}
