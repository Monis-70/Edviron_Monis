import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Ip,
  Query,
  UseGuards,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('webhook')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  async handleWebhook(
    @Body() payload: WebhookPayloadDto,
    @Headers() headers: any,
    @Ip() ip: string,
  ) {
    return this.webhooksService.processWebhook(payload, headers, ip);
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  async getWebhookLogs(@Query() filters: any) {
    return this.webhooksService.getWebhookLogs(filters);
  }

  @Post('retry')
  @UseGuards(JwtAuthGuard)
  async retryFailedWebhooks() {
    return this.webhooksService.retryFailedWebhooks();
  }
}
