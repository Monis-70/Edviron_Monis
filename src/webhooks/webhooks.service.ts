import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WebhookLog, WebhookLogDocument } from '../schemas/webhook-log.schema';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(WebhookLog.name) private webhookLogModel: Model<WebhookLogDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name) private orderStatusModel: Model<OrderStatusDocument>,
  ) {}

  async processWebhook(
    payload: WebhookPayloadDto,
    headers: any,
    ip: string,
  ): Promise<any> {
    const startTime = Date.now();
    const webhookId = `WH_${Date.now()}_${uuidv4().slice(0, 8)}`;

    const webhookLog = await this.webhookLogModel.create({
      webhook_id: webhookId,
      event_type: 'payment_update',
      payload,
      headers,
      ip_address: ip,
      user_agent: headers['user-agent'] || 'unknown',
      status: 'processing',
    });

    try {
      this.validateWebhookPayload(payload);
      const result = await this.updatePaymentStatus(payload.order_info);

      const processingTime = Date.now() - startTime;
      await this.webhookLogModel.findByIdAndUpdate(webhookLog._id, {
        status: 'processed',
        processed_at: new Date(),
        processing_time_ms: processingTime,
        response: result,
        related_order_id: result.orderId,
      });

      this.logger.log(`Webhook processed successfully: ${webhookId}`);

      return {
        success: true,
        webhookId,
        message: 'Webhook processed successfully',
        processingTime: `${processingTime}ms`,
      };
    } catch (error) {
      await this.webhookLogModel.findByIdAndUpdate(webhookLog._id, {
        status: 'failed',
        error_message: error.message,
        processing_time_ms: Date.now() - startTime,
      });

      this.logger.error(`Webhook processing failed: ${error.message}`);
      throw new BadRequestException(error.message);
    }
  }

  private validateWebhookPayload(payload: WebhookPayloadDto) {
    if (!payload.order_info) {
      throw new Error('Invalid webhook payload: missing order_info');
    }

    if (!payload.order_info.order_id) {
      throw new Error('Invalid webhook payload: missing order_id');
    }

    if (payload.status !== 200) {
      this.logger.warn(`Webhook received with non-200 status: ${payload.status}`);
    }
  }

  private async updatePaymentStatus(orderInfo: any) {
    try {
      const order = await this.orderModel.findOne({
        $or: [
          { _id: orderInfo.order_id },
          { custom_order_id: orderInfo.order_id },
        ],
      });

      if (!order) {
        throw new Error(`Order not found: ${orderInfo.order_id}`);
      }

      let orderStatus = await this.orderStatusModel.findOne({
        collect_id: order._id,
      });

      const statusData = {
        collect_id: order._id,
        order_amount: orderInfo.order_amount,
        transaction_amount: orderInfo.transaction_amount,
        payment_mode: orderInfo.payment_mode || 'unknown',
        payment_details: orderInfo.payemnt_details || orderInfo.payment_details || '',
        bank_reference: orderInfo.bank_reference || '',
        payment_message: orderInfo.Payment_message || orderInfo.payment_message || '',
        status: this.mapPaymentStatus(orderInfo.status),
        error_message: orderInfo.error_message || 'NA',
        payment_time: new Date(orderInfo.payment_time),
      };

      if (orderStatus) {
        orderStatus = await this.orderStatusModel.findByIdAndUpdate(
          orderStatus._id,
          statusData,
          { new: true },
        );
      } else {
        orderStatus = await this.orderStatusModel.create(statusData);
      }

      await this.orderModel.findByIdAndUpdate(order._id, {
        $set: {
          'metadata.lastWebhookUpdate': new Date(),
          'metadata.paymentStatus': statusData.status,
          'metadata.bankReference': orderInfo.bank_reference,
        },
      });

      this.logger.log(`Payment status updated for order: ${order.custom_order_id}`);

      return {
        orderId: order._id,
        customOrderId: order.custom_order_id,
        status: statusData.status,
        previousStatus: orderStatus?.status,
      };
    } catch (error) {
      this.logger.error('Error updating payment status:', error);
      throw error;
    }
  }

  private mapPaymentStatus(gatewayStatus: string): string {
    const statusMap = {
      'success': 'success',
      'completed': 'success',
      'paid': 'success',
      'failed': 'failed',
      'cancelled': 'cancelled',
      'pending': 'pending',
      'processing': 'processing',
      'refunded': 'refunded',
    };

    return statusMap[gatewayStatus?.toLowerCase()] || 'unknown';
  }

  async getWebhookLogs(filters: any = {}) {
    const query: any = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.eventType) {
      query.event_type = filters.eventType;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    const logs = await this.webhookLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100)
      .select('-payload.sensitive_data')
      .exec();

    return logs;
  }

  async retryFailedWebhooks() {
    const failedWebhooks = await this.webhookLogModel.find({
      status: 'failed',
      retry_count: { $lt: 3 },
    });

    const results = [];

    for (const webhook of failedWebhooks) {
      try {
        await this.updatePaymentStatus(webhook.payload.order_info);
        
        await this.webhookLogModel.findByIdAndUpdate(webhook._id, {
          status: 'processed',
          processed_at: new Date(),
        });

        results.push({ id: webhook._id, status: 'success' });
      } catch (error) {
        const nextRetry = new Date(Date.now() + (webhook.retry_count + 1) * 60000);
        
        await this.webhookLogModel.findByIdAndUpdate(webhook._id, {
          retry_count: webhook.retry_count + 1,
          next_retry_at: nextRetry,
          error_message: error.message,
        });

        results.push({ id: webhook._id, status: 'retry_scheduled' });
      }
    }

    return {
      processed: results.length,
      results,
    };
  }
}