import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WebhookLog, WebhookLogDocument } from '../schemas/webhook-log.schema';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { PaymentsService } from '../payments/payments.service'; 
// put this at top of each service file (or in a shared types file)
type PaymentStatus = 'success' | 'pending' | 'failed' | 'cancelled';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectModel(WebhookLog.name) private webhookLogModel: Model<WebhookLogDocument>,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name) private orderStatusModel: Model<OrderStatusDocument>,
    private paymentsService: PaymentsService,
  ) {}

  // ✅ Validate payload safely (supports Cashfree + your old format)
  private validateWebhookPayload(payload: any) {
    this.logger.debug('Validating webhook payload:', JSON.stringify(payload, null, 2));

    if (!payload) throw new Error('Empty webhook payload');

    // Cashfree format check
    if (!payload.data && !payload.order_id && !payload.collect_request_id && !payload.order_info) {
      throw new Error('Invalid webhook payload: missing required fields');
    }

    return true;
  }

  // ✅ Process webhook (main entry point)
  async processWebhook(payload: any, headers: any, ip: string): Promise<any> {
    const startTime = Date.now();
    const webhookId = `WH_${Date.now()}_${uuidv4().slice(0, 8)}`;

    // Save initial log
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

// ✅ Case 1: Cashfree format
if (payload.data) {
  const data = payload.data;
  orderInfo = {
    order_id: data.order_id || payload.collect_request_id,
    order_amount: this.parseAmount(payload.amount || payload.am || payload.order_amount),
    transaction_amount: this.parseAmount(payload.amount || payload.am || payload.transaction_amount),
    gateway: 'Cashfree',
    status: this.mapGatewayStatus(data.payment_status, data.capture_status),

    // 🔧 FIXED: prefer top-level payload.payment_mode > data.payment_method > 'unknown'
    payment_mode: payload.payment_mode || data.payment_method || 'unknown',

    payment_time: data.payment_completion_time || new Date().toISOString(),
    bank_reference: data.cf_payment_id || '',
    payment_message: data.payment_message || payload.type || '',
    error_message: data.failure_reason || 'NA',
    gateway_status: data.payment_status || data.status || 'N/A',
    transaction_id: data.cf_payment_id,
  };
}
// ✅ Case 2: Your old format
else if (payload.collect_request_id || payload.order_id) {
  orderInfo = {
    order_id: payload.collect_request_id || payload.order_id,
    order_amount: this.parseAmount(payload.amount || payload.order_amount),
    transaction_amount: this.parseAmount(payload.amount || payload.transaction_amount),
    gateway: payload.gateway || payload.payment_gateway || 'PhonePe',
    status: this.mapGatewayStatus(payload.status),

    // 🔧 FIXED: prefer payload.payment_mode > payload.payment_method
    payment_mode: payload.payment_mode || payload.payment_method || 'unknown',

    payment_time: payload.payment_time || new Date().toISOString(),
    bank_reference: payload.transaction_id || '',
    payment_message: payload.message || '',
    error_message: payload.error || 'NA',
  };
}


  
      // ✅ Case 3: Legacy order_info format
else if (payload.order_info) {
  orderInfo = {
    ...payload.order_info,
    order_amount: this.parseAmount(payload.order_info.order_amount || payload.order_info.amount),
    transaction_amount: this.parseAmount(payload.order_info.transaction_amount || payload.order_info.amount),
    status: this.mapGatewayStatus(payload.order_info.status, payload.order_info.capture_status), // <-- normalize here
  };

      } else {
        throw new Error('Invalid webhook payload format');
      }

      // Update log → processing
      await this.webhookLogModel.findByIdAndUpdate(webhookLog._id, { status: 'processing' });

      // call PaymentsService implementation
// ✅ Normalize orderId
const orderId =
  payload.order_id ||
  payload.collect_request_id ||
  payload.custom_order_id ||
  payload.collect_id;

// ✅ Normalize gatewayStatus
const gatewayStatus =
  payload.status ||
  payload.payment_status ||
  payload.txStatus ||
  'PENDING';

await this.paymentsService.updatePaymentStatus(
  orderId,
  gatewayStatus,
  payload
);


      // Update DB with payment status
     const result = await this.updatePaymentStatusFromWebhook(orderInfo);

      // Finalize log
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
      return {
        success: false,
        webhookId,
        message: error.message,
      };
    }
  }

  // ✅ Helper: parse amount safely
  private parseAmount(amount: any): number {
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  }



// ✅ Unified status mapper
// ✅ Unified status mapper

private mapGatewayStatus(
  gatewayStatus: string,
  captureStatusRaw?: string
): PaymentStatus {
  if (!gatewayStatus) return 'pending';

  const normalized = gatewayStatus.toUpperCase();
  
  // ✅ REMOVED: Cashfree capture_status logic per their documentation
  
  switch (normalized) {
    case 'SUCCESS':
    case 'COMPLETED':
    case 'PAID':
      return 'success';
    case 'FAILED':
    case 'DECLINED':
    case 'ERROR':
      return 'failed';
    case 'USER_DROPPED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    default:
      return 'pending';
  }
}




  // ✅ Update DB with payment status
// Replace only the updatePaymentStatus method with the following:
private async updatePaymentStatusFromWebhook(orderInfo: any) {
  try {
    this.logger.debug(`Searching for order: ${orderInfo.order_id}`);

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
        message: 'Order not found, webhook data saved',
      };
    }

    // ✅ Resolve amounts robustly
    const orderTopAmount = (order as any).amount ?? (order as any).order_amount ?? undefined;
    const parsedOrderAmt = parseFloat(orderInfo.order_amount);
    const parsedTxnAmt = parseFloat(orderInfo.transaction_amount);
    const parsedTopAmt = parseFloat(orderTopAmount);
    const parsedMetaAmt = parseFloat(order.metadata?.amount);

    const resolvedOrderAmount =
      !isNaN(parsedOrderAmt) && parsedOrderAmt > 0
        ? parsedOrderAmt
        : !isNaN(parsedTxnAmt) && parsedTxnAmt > 0
        ? parsedTxnAmt
        : !isNaN(parsedTopAmt) && parsedTopAmt > 0
        ? parsedTopAmt
        : !isNaN(parsedMetaAmt) && parsedMetaAmt > 0
        ? parsedMetaAmt
        : 0;

    const resolvedTransactionAmount =
      !isNaN(parsedTxnAmt) && parsedTxnAmt > 0
        ? parsedTxnAmt
        : !isNaN(parsedOrderAmt) && parsedOrderAmt > 0
        ? parsedOrderAmt
        : resolvedOrderAmount;

    // ✅ Normalize status using gateway + capture_status
    const normalizedStatus = this.mapGatewayStatus(
      orderInfo.status,
      orderInfo.capture_status
    );

 const statusData = {
  collect_id: new mongoose.Types.ObjectId(order._id),
  provider_collect_id: orderInfo.order_id || null,
  custom_order_id: order.custom_order_id,

  order_amount: resolvedOrderAmount,
  transaction_amount: resolvedTransactionAmount,

  // 🔧 FIXED: prefer top-level payload’s mode if available
  payment_mode: orderInfo.payment_mode || 'unknown',

  // 🔧 FIXED: also embed correct mode into payment_details
  payment_details: JSON.stringify({
    ...orderInfo,
    payment_mode: orderInfo.payment_mode || 'unknown',
  }),

  bank_reference: orderInfo.bank_reference || orderInfo.transaction_id || 'N/A',
  payment_message: orderInfo.payment_message || orderInfo.payment_msg || '',
  status: normalizedStatus,
  gateway_status: orderInfo.status || 'N/A',
  capture_status: orderInfo.capture_status || null,
  error_message: orderInfo.error_message || orderInfo.error || 'N/A',
  payment_time: new Date(orderInfo.payment_time || Date.now()),
};


    this.logger.debug('Order found for webhook. order._id: ' + order._id);
    this.logger.debug('Resolved amounts:', { resolvedOrderAmount, resolvedTransactionAmount });
    this.logger.debug('Status data being saved:', JSON.stringify(statusData));

    // ✅ Upsert order status
    let orderStatus = await this.orderStatusModel.findOne({ collect_id: order._id });
    const previousStatus = orderStatus?.status;

    if (orderStatus) {
      orderStatus = await this.orderStatusModel.findByIdAndUpdate(orderStatus._id, statusData, { new: true });
    } else {
      orderStatus = await this.orderStatusModel.create(statusData);
    }

    // ✅ Update order metadata
    await this.orderModel.findByIdAndUpdate(order._id, {
      $set: {
        'metadata.lastWebhookUpdate': new Date(),
        'metadata.paymentStatus': statusData.status,
        'metadata.bankReference': statusData.bank_reference,
        'metadata.amount': resolvedOrderAmount,
        'metadata.transactionId': orderInfo.transaction_id || orderInfo.transactionId || null,
      },
    });

    this.logger.log(`Payment status updated for order: ${order._id}`);

    return {
      orderId: order._id.toString(),                 // Mongo ID
      customOrderId: order.custom_order_id,          // internal ID
      providerCollectId: orderInfo.order_id || null, // Edviron external ID
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



  // ✅ Logs
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
async getOrderStatus(orderId: string) {
  try {
    // First, check if order exists
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

    // Get latest webhook log for this order
    const latestLog = await this.webhookLogModel
      .findOne({ related_order_id: orderId })
      .sort({ receivedAt: -1 })
      .lean();

return {
  order: {
    orderId: order._id.toString(),                           // ✅ local
    customOrderId: order.custom_order_id,                    // ✅ internal
    providerCollectId: latestLog?.response?.providerCollectId || null, // ✅ external
    status: (order as any).status || latestLog?.status || 'unknown',
    orderAmount: (order as any).order_amount || latestLog?.response?.orderAmount || 0,
    transactionAmount: (order as any).transaction_amount || latestLog?.response?.transactionAmount || 0,
    previousStatus: latestLog?.response?.previousStatus || null,
  },
};


   
  } catch (error) {
    this.logger.error(`Error fetching status for order ${orderId}:`, error.stack);
    return { status: 'error', message: 'Failed to fetch order status' };
  }
}

  // ✅ Retry failed webhooks
  async retryFailedWebhooks() {
    const failedWebhooks = await this.webhookLogModel.find({
      status: 'failed',
      retry_count: { $lt: 3 },
    });

    const results = [];

    for (const webhook of failedWebhooks) {
      try {
        let orderInfo;
        if (webhook.payload.data) {
          const data = webhook.payload.data;
          orderInfo = {
            order_id: data.order_id,
            order_amount: this.parseAmount(data.order_amount),
            transaction_amount: this.parseAmount(data.payment_amount || data.order_amount),
           status: this.mapGatewayStatus(data.payment_status),

          };
        } else if (webhook.payload.order_info) {
          orderInfo = webhook.payload.order_info;
        } else {
          throw new Error('Cannot extract order info from webhook payload');
        }

        await this.updatePaymentStatusFromWebhook(orderInfo);

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

    return { processed: results.length, results };
  }
}