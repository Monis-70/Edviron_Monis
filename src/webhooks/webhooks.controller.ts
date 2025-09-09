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
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
// removed WebhookPayloadDto import on purpose so controller accepts raw JSON
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Public } from '../auth/decorators/current-user.decorator';

@Controller('webhook')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  // ✅ Payment gateway calls this
  @Post()
  @Public()
  async handleWebhook(
    @Body() payload: any,           // <-- changed to `any` to accept Cashfree 'data' shape
    @Headers() headers: any,
    @Ip() ip: string,
  ) {
    if (!payload) {
      throw new BadRequestException('Empty webhook payload');
    }
    return this.webhooksService.processWebhook(payload, headers, ip);
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
