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

 async processWebhook(
  payload: any, // Changed from WebhookPayloadDto to any for flexibility
  headers: any,
  ip: string,
): Promise<any> {
  const startTime = Date.now();
  const webhookId = `WH_${Date.now()}_${uuidv4().slice(0, 8)}`;

  // Create webhook log entry
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
    // Handle Edviron webhook format
    let orderInfo: any;
    
    // Check if it's Edviron webhook format
    if (payload.collect_request_id || payload.order_id) {
      // Convert Edviron format to our format
      orderInfo = {
        order_id: payload.collect_request_id || payload.order_id,
        order_amount: payload.amount,
        transaction_amount: payload.amount,
        gateway: payload.gateway || 'PhonePe',
        status: payload.status || 'pending',
        payment_mode: payload.payment_method || 'unknown',
        payment_time: payload.payment_time || new Date().toISOString(),
        bank_reference: payload.transaction_id || '',
        Payment_message: payload.message || '',
        error_message: payload.error || 'NA',
      };
    } else if (payload.order_info) {
      // Original format
      orderInfo = payload.order_info;
    } else {
      throw new Error('Invalid webhook payload format');
    }

    // Process the payment update
    const result = await this.updatePaymentStatus(orderInfo);

    // Update webhook log with success
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
    // Update webhook log with error
    await this.webhookLogModel.findByIdAndUpdate(webhookLog._id, {
      status: 'failed',
      error_message: error.message,
      processing_time_ms: Date.now() - startTime,
    });

    this.logger.error(`Webhook processing failed: ${error.message}`);
    // Don't throw error for webhook, just log it
    return {
      success: false,
      webhookId,
      message: error.message,
    };
  }
}

private async updatePaymentStatus(orderInfo: any) {
  try {
    // Find order by collect_request_id from metadata or custom_order_id
    const order = await this.orderModel.findOne({
      $or: [
        { 'metadata.collectRequestId': orderInfo.order_id },
        { custom_order_id: orderInfo.order_id },
        { _id: orderInfo.order_id },
      ],
    });

    if (!order) {
      // Log but don't fail - webhook might arrive before we save the order
      this.logger.warn(`Order not found for webhook: ${orderInfo.order_id}`);
      return {
        orderId: orderInfo.order_id,
        status: 'order_not_found',
        message: 'Order not found, webhook data saved',
      };
    }

    // Rest of the update logic remains the same...
    let orderStatus = await this.orderStatusModel.findOne({
      collect_id: order._id,
    });

    const statusData = {
      collect_id: order._id,
      order_amount: orderInfo.order_amount || orderInfo.amount,
      transaction_amount: orderInfo.transaction_amount || orderInfo.amount,
      payment_mode: orderInfo.payment_mode || 'unknown',
      payment_details: orderInfo.payemnt_details || orderInfo.payment_details || '',
      bank_reference: orderInfo.bank_reference || '',
      payment_message: orderInfo.Payment_message || orderInfo.payment_message || '',
      status: this.mapPaymentStatus(orderInfo.status),
      error_message: orderInfo.error_message || 'NA',
      payment_time: new Date(orderInfo.payment_time || Date.now()),
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

    this.logger.log(`Payment status updated for order: ${order._id.toString()}`);

return {
  orderId: order._id,
  customOrderId: order._id.toString(), // convert ObjectId to string if needed
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