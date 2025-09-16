import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WebhookLog, WebhookLogDocument } from '../schemas/webhook-log.schema';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { PaymentsService } from '../payments/payments.service';
import { mapGatewayStatus, shouldUpdateStatus, extractPaymentMode, PaymentStatus } from '../utils/payment-status.utils';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(WebhookLog.name) private webhookLogModel: Model<WebhookLogDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name) private orderStatusModel: Model<OrderStatusDocument>,
    private paymentsService: PaymentsService,
  ) {}

  private validateWebhookPayload(payload: any) {
    if (!payload) throw new Error('Empty webhook payload');
    if (!payload.data && !payload.order_id && !payload.collect_request_id && !payload.order_info) {
      throw new Error('Invalid webhook payload: missing required fields');
    }
    return true;
  }

  async processWebhook(payload: any, headers: any, ip: string): Promise<any> {
    const startTime = Date.now();
    const webhookId = `WH_${Date.now()}_${uuidv4().slice(0, 8)}`;

    const webhookLog = await this.webhookLogModel.create({
      webhook_id: webhookId,
      event_type: payload.type || 'payment_update',
      payload,
      headers,
      ip_address: ip,
      user_agent: headers['user-agent'] || 'unknown',
      status: 'pending',
    });

    try {
      this.validateWebhookPayload(payload);

      let orderInfo: any;

      // Parse different webhook formats
      if (payload.data) {
        // Cashfree format
        const data = payload.data;
        orderInfo = {
          order_id: data.order_id || payload.collect_request_id,
          order_amount: this.parseAmount(payload.amount || payload.am || payload.order_amount),
          transaction_amount: this.parseAmount(payload.amount || payload.am || payload.transaction_amount),
          gateway: 'Cashfree',
          status: mapGatewayStatus(data.payment_status, data.capture_status), // Use shared util
          payment_mode: extractPaymentMode(payload, data), // Use shared util
          payment_time: data.payment_completion_time || new Date().toISOString(),
          bank_reference: data.cf_payment_id || '',
          payment_message: data.payment_message || payload.type || '',
          error_message: data.failure_reason || 'N/A',
          gateway_status: data.payment_status || data.status || 'N/A',
          transaction_id: data.cf_payment_id,
          raw_payload: payload, // Store complete payload
        };
      } else if (payload.collect_request_id || payload.order_id) {
        // Legacy format
        orderInfo = {
          order_id: payload.collect_request_id || payload.order_id,
          order_amount: this.parseAmount(payload.amount || payload.order_amount),
          transaction_amount: this.parseAmount(payload.amount || payload.transaction_amount),
          gateway: payload.gateway || payload.payment_gateway || 'PhonePe',
          status: mapGatewayStatus(payload.status), // Use shared util
          payment_mode: extractPaymentMode(payload), // Use shared util
          payment_time: payload.payment_time || new Date().toISOString(),
          bank_reference: payload.transaction_id || '',
          payment_message: payload.message || '',
          error_message: payload.error || 'N/A',
          raw_payload: payload, // Store complete payload
        };
      } else if (payload.order_info) {
        // Order info format
        orderInfo = {
          ...payload.order_info,
          order_amount: this.parseAmount(payload.order_info.order_amount || payload.order_info.amount),
          transaction_amount: this.parseAmount(payload.order_info.transaction_amount || payload.order_info.amount),
          status: mapGatewayStatus(payload.order_info.status, payload.order_info.capture_status), // Use shared util
          raw_payload: payload, // Store complete payload
        };
      } else {
        throw new Error('Invalid webhook payload format');
      }

      await this.webhookLogModel.findByIdAndUpdate(webhookLog._id, { status: 'processing' });

      const orderId = payload.order_id || payload.collect_request_id || payload.custom_order_id || payload.collect_id;
      const gatewayStatus = payload.status || payload.payment_status || payload.txStatus || 'PENDING';

     // await this.paymentsService.updatePaymentStatus(orderId, gatewayStatus, payload);
      const result = await this.updatePaymentStatusFromWebhook(orderInfo);

      const processingTime = Date.now() - startTime;
      await this.webhookLogModel.findByIdAndUpdate(webhookLog._id, {
        status: 'processed',
        processed_at: new Date(),
        processing_time_ms: processingTime,
        response: result,
        related_order_id: result.orderId,
      });

      return {
        success: true,
        webhookId,
        message: 'Webhook processed successfully',
        processingTime: `${processingTime}ms`,
        order: {
          orderId: result.orderId,
          customOrderId: result.customOrderId,
          status: result.status,
          orderAmount: result.orderAmount,
          transactionAmount: result.transactionAmount,
          previousStatus: result.previousStatus || null,
        },
      };
    } catch (error) {
      await this.webhookLogModel.findByIdAndUpdate(webhookLog._id, {
        status: 'failed',
        error_message: error.message,
        processing_time_ms: Date.now() - startTime,
      });

      this.logger.error(`Webhook processing failed: ${error.message}`);
      return { success: false, webhookId, message: error.message };
    }
  }

  private parseAmount(amount: any): number {
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }

  private async updatePaymentStatusFromWebhook(orderInfo: any) {
    try {
      const searchConditions: any[] = [
        { 'metadata.collectRequestId': orderInfo.order_id },
        { 'metadata.collect_id': orderInfo.order_id },
        { custom_order_id: orderInfo.order_id },
        { order_id: orderInfo.order_id },
        { 'student_info.custom_order_id': orderInfo.order_id },
        ...(mongoose.Types.ObjectId.isValid(orderInfo.order_id)
          ? [{ _id: orderInfo.order_id }]
          : []),
      ];

      const order = await this.orderModel.findOne({ $or: searchConditions }).lean();

      if (!order) {
        this.logger.warn(`Order not found for webhook: ${orderInfo.order_id}`);
        return {
          orderId: orderInfo.order_id,
          customOrderId: orderInfo.order_id,
          providerCollectId: orderInfo.order_id || null,
          status: 'order_not_found',
          orderAmount: orderInfo.order_amount || 0,
          transactionAmount: orderInfo.transaction_amount || 0,
        };
      }

      // Resolve amounts
      const resolvedOrderAmount = orderInfo.order_amount || orderInfo.transaction_amount || order.amount || 0;
      const resolvedTransactionAmount = orderInfo.transaction_amount || orderInfo.order_amount || order.amount || 0;

      // Use shared util for consistent mapping
      // ✅ FIX: include capture_status and gateway_status in mapping
const normalizedStatus = mapGatewayStatus(
  orderInfo.status,
 orderInfo.capture_status
);

// ✅ Debug log (optional but recommended)
this.logger.log(
  `🔄 Webhook update: Order=${order._id}, Raw=${orderInfo.status}, Capture=${orderInfo.capture_status}, Gateway=${orderInfo.gateway_status}, Normalized=${normalizedStatus}`
);


      // Apply downgrade protection
      const existingOrderStatus = await this.orderStatusModel.findOne({ collect_id: order._id });
      const previousStatus = existingOrderStatus?.status;

      if (existingOrderStatus && !shouldUpdateStatus(previousStatus as PaymentStatus, normalizedStatus)) {
        this.logger.warn(`Ignoring downgrade for order ${order._id}: ${previousStatus} -> ${normalizedStatus}`);
        return {
          orderId: order._id.toString(),
          customOrderId: order.custom_order_id,
          providerCollectId: orderInfo.order_id || null,
          status: previousStatus,
          orderAmount: resolvedOrderAmount,
          transactionAmount: resolvedTransactionAmount,
          previousStatus,
        };
      }

      const paymentMode = extractPaymentMode(orderInfo);

      // Store complete data including raw webhook payload
      const statusData = {
        collect_id: new mongoose.Types.ObjectId(order._id),
        provider_collect_id: orderInfo.order_id || null,
        custom_order_id: order.custom_order_id,
        order_amount: resolvedOrderAmount,
        transaction_amount: resolvedTransactionAmount,
        status: normalizedStatus,
        gateway_status: orderInfo.gateway_status || orderInfo.status || 'N/A', // Raw gateway status
        payment_time: new Date(orderInfo.payment_time || Date.now()),
        payment_mode: paymentMode,
        payment_message: orderInfo.payment_message || orderInfo.payment_msg || '',
        bank_reference: orderInfo.bank_reference || orderInfo.transaction_id || 'N/A',
        error_message: orderInfo.error_message || orderInfo.error || 'N/A',
        capture_status: orderInfo.capture_status || null,
        payment_details: JSON.stringify(orderInfo.raw_payload || orderInfo), // Complete webhook payload
      };

      // Upsert order status
      if (existingOrderStatus) {
        await this.orderStatusModel.findByIdAndUpdate(existingOrderStatus._id, statusData, { new: true });
      } else {
        await this.orderStatusModel.create(statusData);
      }

      // Update order metadata
      await this.orderModel.findByIdAndUpdate(order._id, {
        $set: {
          'metadata.lastWebhookUpdate': new Date(),
          'metadata.paymentStatus': statusData.status,
          'metadata.bankReference': statusData.bank_reference,
          'metadata.amount': resolvedOrderAmount,
          'metadata.payment_mode': paymentMode,
          'metadata.transactionId': orderInfo.transaction_id || null,
        },
      });

      return {
        orderId: order._id.toString(),
        customOrderId: order.custom_order_id,
        providerCollectId: orderInfo.order_id || null,
        status: normalizedStatus,
        orderAmount: resolvedOrderAmount,
        transactionAmount: resolvedTransactionAmount,
        previousStatus,
      };
    } catch (error) {
      this.logger.error('Error updating payment status:', error);
      throw error;
    }
  }

  // ✅ Get webhook logs with filtering
  async getWebhookLogs(filters: any = {}) {
    const query: any = {};

    if (filters.status) query.status = filters.status;
    if (filters.eventType) query.event_type = filters.eventType;
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    return this.webhookLogModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filters.limit || 100)
      .select('-payload.sensitive_data')
      .exec();
  }

  // ✅ Get order status by ID
  async getOrderStatus(orderId: string) {
    try {
      const order = await this.orderModel.findOne({
        $or: [
          { order_id: orderId },
          { custom_order_id: orderId },
          { 'metadata.collectRequestId': orderId },
          { 'metadata.collect_id': orderId },
          ...(mongoose.Types.ObjectId.isValid(orderId) ? [{ _id: orderId }] : []),
        ],
      }).lean();

      if (!order) {
        return { status: 'order_not_found', orderId };
      }

      // Get the latest order status from the order_status collection (primary source)
      const orderStatus = await this.orderStatusModel.findOne({ 
        collect_id: order._id 
      }).sort({ updatedAt: -1 }).lean();

      // Get latest webhook log for this order (fallback/additional info)
      const latestLog = await this.webhookLogModel
        .findOne({ 
          $or: [
            { related_order_id: order._id.toString() },
            { related_order_id: orderId },
            { 'payload.order_id': orderId },
            { 'payload.collect_request_id': orderId }
          ]
        })
        .sort({ createdAt: -1 })
        .lean();

    return {
  order: {
    orderId: order._id.toString(),
    customOrderId: order.custom_order_id,
    providerCollectId: orderStatus?.provider_collect_id || latestLog?.response?.providerCollectId || null,
    status: orderStatus?.status || (order as any).status || 'unknown',
    orderAmount: orderStatus?.order_amount || (order as any).order_amount || 0,
    transactionAmount: orderStatus?.transaction_amount || (order as any).transaction_amount || 0,
    paymentMode: orderStatus?.payment_mode || (order as any).metadata?.payment_mode || 'unknown',
    previousStatus: latestLog?.response?.previousStatus || null,

    // ✅ Fix updatedAt typing issue
    lastUpdated: (orderStatus as any)?.updatedAt || latestLog?.processed_at || (order as any)?.updatedAt,

    // ✅ Fix gateway field issue
    gateway: (order as any)?.gateway_name || 'unknown',

    bankReference: orderStatus?.bank_reference || null,
    paymentMessage: orderStatus?.payment_message || null,
    errorMessage: orderStatus?.error_message !== 'N/A' ? orderStatus?.error_message : null,
  },
};

    } catch (error) {
      this.logger.error(`Error fetching status for order ${orderId}:`, error.stack);
      return { status: 'error', message: 'Failed to fetch order status' };
    }
  }

  // ✅ Retry failed webhooks with exponential backoff
  async retryFailedWebhooks() {
    const failedWebhooks = await this.webhookLogModel.find({
      status: 'failed',
      retry_count: { $lt: 3 },
    });

    const results = [];

    for (const webhook of failedWebhooks) {
      try {
        let orderInfo;

        // Parse the stored payload based on format
        if (webhook.payload.data) {
          // Cashfree format
          const data = webhook.payload.data;
          orderInfo = {
            order_id: data.order_id,
            order_amount: this.parseAmount(data.order_amount || webhook.payload.amount),
            transaction_amount: this.parseAmount(data.payment_amount || data.order_amount),
            status: mapGatewayStatus(data.payment_status, data.capture_status), // Use shared util
            gateway: 'Cashfree',
            payment_mode: extractPaymentMode(webhook.payload, data), // Use shared util
            payment_time: data.payment_completion_time || new Date().toISOString(),
            bank_reference: data.cf_payment_id || '',
            payment_message: data.payment_message || '',
            error_message: data.failure_reason || 'N/A',
            gateway_status: data.payment_status || 'N/A',
            transaction_id: data.cf_payment_id,
            raw_payload: webhook.payload,
          };
        } else if (webhook.payload.order_info) {
          // Order info format
          orderInfo = {
            ...webhook.payload.order_info,
            status: mapGatewayStatus(webhook.payload.order_info.status, webhook.payload.order_info.capture_status), // Use shared util
            raw_payload: webhook.payload,
          };
        } else {
          // Legacy format
          orderInfo = {
            order_id: webhook.payload.collect_request_id || webhook.payload.order_id,
            order_amount: this.parseAmount(webhook.payload.amount || webhook.payload.order_amount),
            transaction_amount: this.parseAmount(webhook.payload.transaction_amount || webhook.payload.amount),
            status: mapGatewayStatus(webhook.payload.status), // Use shared util
            payment_mode: extractPaymentMode(webhook.payload), // Use shared util
            gateway: webhook.payload.gateway || 'PhonePe',
            raw_payload: webhook.payload,
          };
        }

        // Attempt to process the webhook again
        await this.updatePaymentStatusFromWebhook(orderInfo);

        // Mark as processed
        await this.webhookLogModel.findByIdAndUpdate(webhook._id, {
          status: 'processed',
          processed_at: new Date(),
          retry_count: (webhook.retry_count || 0) + 1,
        });

        results.push({ 
          id: webhook._id, 
          status: 'success',
          orderId: orderInfo.order_id,
          retryAttempt: (webhook.retry_count || 0) + 1
        });

        this.logger.log(`Successfully retried webhook ${webhook._id} for order ${orderInfo.order_id}`);

      } catch (error) {
        // Schedule next retry with exponential backoff
        const retryCount = (webhook.retry_count || 0) + 1;
        const backoffMinutes = Math.pow(2, retryCount) * 5; // 10, 20, 40 minutes
        const nextRetry = new Date(Date.now() + backoffMinutes * 60000);

        await this.webhookLogModel.findByIdAndUpdate(webhook._id, {
          retry_count: retryCount,
          next_retry_at: nextRetry,
          error_message: error.message,
          last_retry_at: new Date(),
        });

        results.push({ 
          id: webhook._id, 
          status: 'retry_scheduled',
          nextRetry: nextRetry.toISOString(),
          retryAttempt: retryCount,
          error: error.message
        });

        this.logger.warn(`Webhook retry ${retryCount} failed for ${webhook._id}, next retry at ${nextRetry.toISOString()}: ${error.message}`);
      }
    }

    this.logger.log(`Processed ${results.length} failed webhooks for retry`);
    return { 
      processed: results.length, 
      results,
      summary: {
        successful: results.filter(r => r.status === 'success').length,
        rescheduled: results.filter(r => r.status === 'retry_scheduled').length
      }
    };
  }
}