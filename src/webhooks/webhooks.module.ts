import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookLog, WebhookLogSchema } from '../schemas/webhook-log.schema';
import { Order, OrderSchema } from '../schemas/order.schema';
import { OrderStatus, OrderStatusSchema } from '../schemas/order-status.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: WebhookLog.name, schema: WebhookLogSchema },
      { name: Order.name, schema: OrderSchema },
      { name: OrderStatus.name, schema: OrderStatusSchema },
    ]),
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
