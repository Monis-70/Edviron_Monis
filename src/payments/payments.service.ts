import {
  Injectable,
  BadRequestException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';

type PaymentStatus = 'success' | 'pending' | 'failed' | 'cancelled';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name)
    private orderStatusModel: Model<OrderStatusDocument>,
    private httpService: HttpService,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

private mapGatewayStatus(gatewayStatus: string, captureStatusRaw?: string): PaymentStatus {
  if (!gatewayStatus) return 'pending';
  const normalized = gatewayStatus.toUpperCase();
  const capture = captureStatusRaw?.toUpperCase();

  // ✅ Cashfree quirk
  if (normalized === 'SUCCESS' && capture === 'PENDING') {
    return 'pending';
  }

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
  // Create payment request
  async createPayment(createPaymentDto: CreatePaymentDto, user?: any) {
    try {
      const { student_info, amount, gateway, feeType, description, returnUrl } = createPaymentDto;

      // Generate unique custom order ID
      const customOrderId = `ORD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Step 1: Create order in DB with ALL required fields
      const order = new this.orderModel({
        school_id: new Types.ObjectId(this.configService.get('SCHOOL_ID')),
        trustee_id: new Types.ObjectId(
          createPaymentDto.trustee_id || '65b0e552dd31950a9b41c5ba'
        ),
        amount: amount,
        student_info: {
          name: student_info.name,
          id: student_info.id,
          email: student_info.email,
          phone: student_info.phone,
          class: student_info.class,
          section: student_info.section,
        },
        fee_type: feeType,
        description: description,
        order_id: customOrderId, 
        metadata: { 
  amount,
  collectRequestId: customOrderId, // 👈 init with same ID
  collect_id: customOrderId        // 👈 init with same ID
},
        gateway_name: gateway || 'edviron',
        return_url: returnUrl,
        
        custom_order_id: customOrderId,
      });

      await order.save();
      this.logger.log('Order saved successfully:', order._id);

      // Step 2: Prepare payload for payment API
      const callback_url =
        createPaymentDto.returnUrl ||
        `${this.configService.get('FRONTEND_URL')}/payments/status`;

      const payload = {
        school_id: this.configService.get('SCHOOL_ID'),
        amount: amount.toString(),
        callback_url,
      };

      this.logger.log('JWT payload for signing:', payload);

      // Step 3: Sign payload
      const sign = this.jwtService.sign(payload, {
        secret: this.configService.get('PG_KEY'),
        algorithm: 'HS256',
      });

      const requestBody = { ...payload, sign };



      

      try {
        // Step 4: Call external payment API with enhanced debugging
        // build API URL robustly (handles env set to base URL OR full endpoint)
        const apiBaseRaw = this.configService.get('PAYMENT_API_URL') || 'https://dev-vanilla.edviron.com';
        const endpointPath = '/erp/create-collect-request';

        // Normalize: remove trailing slash from apiBaseRaw
        const apiBase = apiBaseRaw.endsWith('/') ? apiBaseRaw.slice(0, -1) : apiBaseRaw;

        // If apiBase already includes the endpointPath, use it as-is, otherwise append endpointPath
        const apiUrl = apiBase.includes(endpointPath)
          ? apiBase
          : apiBase + endpointPath;

        const apiKey = this.configService.get('API_KEY');

        this.logger.log('=== EXTERNAL API CALL DEBUG ===');
        this.logger.log('API URL:', apiUrl);
        this.logger.log('API Key present:', apiKey ? 'Yes' : 'No');
        this.logger.log('Request payload:', JSON.stringify(requestBody, null, 2));

        const response = await firstValueFrom(
          this.httpService.post(apiUrl, requestBody, {
            headers: {
              'Content-Type': 'application/json',
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
          }),
        );

        this.logger.log('=== EXTERNAL API RESPONSE ===');
        this.logger.log('Response status:', response.status);
        this.logger.log('Response headers:', JSON.stringify(response.headers, null, 2));
        this.logger.log('Response data:', JSON.stringify(response.data, null, 2));

        const resData = response.data;

        // Log specific fields we're looking for
this.logger.log('=== CHECKING RESPONSE FIELDS ===');
this.logger.log('collect_request_id:', resData.collect_request_id);
this.logger.log('collect_request_url:', resData.collect_request_url);
this.logger.log('sign:', resData.sign);
this.logger.log('All response keys:', Object.keys(resData));
const providerId = resData.collect_request_id || resData.collect_id;
if (providerId) {
await this.orderModel.findByIdAndUpdate(order._id, {
  $set: {
    'metadata.collectRequestId': providerId,
    'metadata.collect_id': providerId,
    'metadata.providerResponse': resData,
    order_id: providerId,
   // custom_order_id: providerId,
  },
});

}

        // Step 5: Validate external API response
        if (!resData.collect_request_url) {
          this.logger.error('=== MISSING PAYMENT URL ===');
          this.logger.error('Expected field: collect_request_url');
          this.logger.error('Available fields:', Object.keys(resData));
          this.logger.error('Full response:', resData);
          throw new Error('Payment URL not received from external API');
        }

        // Step 6: Save order status
        // compute resolved values before writing (prevent undefined variable errors)
const gatewayStatusRaw = resData.status ?? resData.payment_status ?? 'PENDING';
const captureStatusRaw = resData.capture_status ?? resData.txStatus; // ✅ add this
const mappedStatus = this.mapGatewayStatus(gatewayStatusRaw)

let resolvedAmount = parseFloat(
  (resData.amount ?? resData.am ?? resData.order_amount ?? 0).toString()
) || 0;



// ✅ Fallback: parse from collect_request_url if missing
if ((!resolvedAmount || isNaN(resolvedAmount)) && resData.collect_request_url) {
  try {
    const url = new URL(resData.collect_request_url);
    const amt = url.searchParams.get("amount");
    if (amt) {
      resolvedAmount = parseFloat(amt);
      this.logger.log("✅ Parsed amount from collect_request_url -> " + resolvedAmount);
    }
  } catch (e) {
    this.logger.warn("⚠️ Failed to parse amount from collect_request_url", e);
  }
}


        const paymentMsg = resData.message ?? resData.payment_message ?? resData.txMsg ?? `Payment ${mappedStatus}`;
        const errMsg = resData.error_message ?? resData.failure_reason ?? resData.error ?? 'N/A';
        const bankRef = resData.bank_reference ?? resData.referenceId ?? resData.cf_payment_id ?? 'N/A';
        const paymentDetails = resData.details ? JSON.stringify(resData.details) : JSON.stringify(resData);

        // Step 6: Save order status (include collect_id to satisfy schema)
        await this.orderStatusModel.create({
          custom_order_id: customOrderId,
          collect_request_id: resData.collect_request_id || resData.collect_id || customOrderId,
          collect_id: order?._id || new Types.ObjectId(),  // always Order reference
  provider_collect_id: resData.collect_request_id || resData.collect_id || customOrderId, // store gateway id separately
          order_amount: resolvedAmount,
          transaction_amount: resolvedAmount,
          
          status: mappedStatus, // use computed mappedStatus
          payment_time: resData.payment_time ? new Date(resData.payment_time) : new Date(),
          payment_mode: resData.payment_mode || resData.paymentMethod || 'N/A',

          // required fields — always provide something (provider-specific fields if present)
          payment_message: paymentMsg,
          error_message: errMsg,
          bank_reference: bankRef,
          payment_details: paymentDetails, // store provider details for later debugging

          // optional: keep original gateway status raw
          gateway_status: gatewayStatusRaw,
        });

        await this.orderModel.findByIdAndUpdate(order._id, {
          $set: { 'metadata.collectRequestId': resData.collect_request_id, 'metadata.collect_id': resData.collect_request_id },
        });

          this.logger.log(
    `Mapped provider collect_request_id=${providerId} to local order _id=${order._id}`
  );

        // Step 7: Return response
        const result = {
          success: true,
          order_id: order._id,
          collect_request_id: resData.collect_request_id,
          payment_url: resData.collect_request_url, // ✅ Use lowercase field name
          sign: resData.sign,
        };

        this.logger.log('Service returning:', result);
        return result;

      } catch (error) {
        this.logger.error('=== EXTERNAL API ERROR ===');

        if (error.response) {
          // The request was made and the server responded with a status code
          this.logger.error('Response status:', error.response.status);
          this.logger.error('Response data:', JSON.stringify(error.response.data, null, 2));
          this.logger.error('Response headers:', JSON.stringify(error.response.headers, null, 2));
        } else if (error.request) {
          // The request was made but no response was received
          this.logger.error('No response received:', error.request);
        } else {
          // Something happened in setting up the request
          this.logger.error('Request setup error:', error.message);
        }

        throw error;
      }

    } catch (error) {
      this.logger.error('Payment creation failed:', error.message);
      this.logger.error('Full error object:', error);
      throw new HttpException(
        error.response?.data || 'Failed to create payment',
        error.response?.status || HttpStatus.BAD_REQUEST,
      );
    }
  }

  // Fetch transaction status by custom order ID
  async getPaymentStatus(customOrderId: string) {
    try {
      this.logger.log(`Fetching payment status for ${customOrderId}`);

      // 1) Try DB first (fast, avoids external calls)
const searchConditions: Record<string, any>[] = [
  { custom_order_id: customOrderId },
  { 'metadata.collectRequestId': customOrderId },
  { 'metadata.collect_id': customOrderId },
  { order_id: customOrderId },
   { provider_collect_id: customOrderId },
];
const order = await this.orderModel.findOne({ $or: searchConditions }).lean();

if (Types.ObjectId.isValid(customOrderId)) {
  searchConditions.push({ _id: new Types.ObjectId(customOrderId) });
}

this.logger.debug(
  `getPaymentStatus() searching with conditions:\n${JSON.stringify(searchConditions, null, 2)}`
);

const orderStatus = await this.orderStatusModel.findOne({ $or: searchConditions });
//const order = await this.orderModel.findOne({ $or: searchConditions }).lean();

if (!order && !orderStatus) {
  this.logger.warn(`getPaymentStatus(): No matching order found for ${customOrderId}`);
}


// in getPaymentStatus()
if (orderStatus) {
  // if DB says pending but gateway says SUCCESS, prefer gateway
  const normalized = this.mapGatewayStatus(
    orderStatus.gateway_status,
    orderStatus.capture_status,
  );

  return {
    custom_order_id: order.custom_order_id,
    provider_collect_id: orderStatus?.provider_collect_id || null,
    status: normalized, // ✅ always normalized
    amount: orderStatus.transaction_amount ?? orderStatus.order_amount ?? order.amount ?? 0,
    payment_time: orderStatus.payment_time || null,
    payment_mode: orderStatus.payment_mode || 'N/A',
  };
}


      // 2) DB missing: try external payment provider API (Edviron / your gateway)
      // Build sign (JWT) as you already do elsewhere
      const jwtPayload = {
        school_id: this.configService.get('SCHOOL_ID'),
        collect_request_id: customOrderId,
      };

      const sign = this.jwtService.sign(jwtPayload, {
        secret: this.configService.get('PG_KEY'),
        algorithm: 'HS256',
      });

      // build apiUrl for collect-request GET robustly (inside getPaymentStatus)
      const apiBaseRaw = this.configService.get('PAYMENT_API_URL') || 'https://dev-vanilla.edviron.com';

      // strip any /erp... part so we never double-append
      const baseWithoutErp = apiBaseRaw.replace(/\/erp.*$/i, '').replace(/\/+$/, '');

      // build path for collect-request
      const collectPath = `/erp/collect-request/${customOrderId}?school_id=${this.configService.get('SCHOOL_ID')}&sign=${sign}`;

      // final URL
      const apiUrl = baseWithoutErp + collectPath;

      this.logger.log(`Calling external payment API: ${apiUrl}`);

      try {
        const response = await firstValueFrom(this.httpService.get(apiUrl, {
          headers: {
            'Content-Type': 'application/json',
            // Ensure API_KEY is sent as Bearer token if required by provider
            ...(this.configService.get('API_KEY') && {
              Authorization: `Bearer ${this.configService.get('API_KEY')}`,
            }),
          },
        }));

        const resData = response.data;
        this.logger.log('External payment provider response:', JSON.stringify(resData, null, 2));
      const gatewayStatusRaw = resData.status ?? resData.payment_status ?? 'PENDING';
       const captureStatusRaw = resData.capture_status ?? resData.txStatus; // ✅ add this
        const mappedStatus = this.mapGatewayStatus(gatewayStatusRaw)
// ✅ Step: Resolve amount safely
let resolvedAmount = parseFloat(
  (resData.amount ?? resData.am ?? resData.order_amount ?? 0).toString()
) || 0;


// ✅ Fallback: if API didn’t send numeric amount, parse from collect_request_url
if ((resolvedAmount === 0 || isNaN(resolvedAmount)) && resData.collect_request_url) {
  try {
    const url = new URL(resData.collect_request_url);
    const amt = url.searchParams.get('amount');
    if (amt) {
      resolvedAmount = parseFloat(amt);
      this.logger.log(`Parsed amount from collect_request_url: ${resolvedAmount}`);
    }
  } catch (e) {
    this.logger.warn('Failed to parse amount from collect_request_url', e.message);
  }
}


        const paymentMsg = resData.message ?? resData.payment_message ?? `Payment ${mappedStatus}`;
        const errMsg = resData.error_message ?? resData.failure_reason ?? 'N/A';
        const bankRef = resData.bank_reference ?? resData.referenceId ?? resData.cf_payment_id ?? 'N/A';
        const paymentDetails = resData.details ? JSON.stringify(resData.details) : JSON.stringify(resData);
    


        // Optionally persist a new orderStatus record if you want to cache
        await this.orderStatusModel.create({
          custom_order_id: customOrderId,
          collect_request_id: resData.collect_request_id || resData.collect_id || customOrderId,
          collect_id: order?._id || new Types.ObjectId(),  // always Order reference
  provider_collect_id: resData.collect_request_id || resData.collect_id || customOrderId, // store gateway id separately
          order_amount: resolvedAmount,
          transaction_amount: resolvedAmount,
          status: mappedStatus,
          payment_time: resData.payment_time ? new Date(resData.payment_time) : new Date(),
          payment_mode: resData.payment_mode || resData.paymentMethod || 'N/A',
          payment_message: paymentMsg,
          
          error_message: errMsg,
          bank_reference: bankRef,
          payment_details: paymentDetails,
          gateway_status: gatewayStatusRaw,
          capture_status: captureStatusRaw,
        });

        return {
          customOrderId,
          status: mappedStatus,
          amount: resolvedAmount,
        };
      } catch (externalErr: any) {
        // If external API returns 401 like "Bearer token is missing", log it clearly
        this.logger.error(`External API error fetching status for ${customOrderId}:`, externalErr?.response?.data || externalErr?.message || externalErr);

        // If you have partial local data (order document), try to return that
        const order = await this.orderModel.findOne({
          $or: [
            { 'metadata.collectRequestId': customOrderId },
            { custom_order_id: customOrderId },
            { order_id: customOrderId }, 
            { _id: customOrderId },
            
          ],
        }).lean();

        const fallbackAmount =
          (order && ((order as any).amount ?? (order as any).order_amount ?? order.metadata?.amount)) ?? 0;

        return {
          customOrderId,
          status: 'unknown',
          amount: fallbackAmount,
          message: externalErr?.response?.data?.message || externalErr?.message || 'Failed to fetch external status',
        };
      }
    } catch (error) {
      this.logger.error(
        `Error fetching payment status for ${customOrderId}`,
        error?.response?.data || error?.message || error,
      );
      throw new BadRequestException('Failed to fetch payment status');
    }
  }

  // Fetch transaction details for collect-payment route
async collectPaymentStatus(customOrderId: string) {
  try {
   const orderStatus = await this.orderStatusModel.findOne({
  $or: [
    { collect_id: new Types.ObjectId(customOrderId) },  // ✅ if valid ObjectId
    { provider_collect_id: customOrderId },
    { custom_order_id: customOrderId },
    { collect_request_id: customOrderId },
  ],
});

    const order = await this.orderModel.findById(customOrderId).lean();

    if (!orderStatus && !order) {
      return { customOrderId, status: 'not_found' };
    }

    // ✅ Resolve amount: prefer orderStatus, fallback to order.amount
   // ✅ Resolve amount: prefer orderStatus, fallback to order.amount
const resolvedAmount =
  orderStatus?.transaction_amount ??
  orderStatus?.order_amount ??
  order?.amount ??
  order?.metadata?.amount ??
  0;


    return {
      customOrderId,
      status: orderStatus?.status || 'pending',
      amount: resolvedAmount,
      orderAmount: orderStatus?.order_amount ?? order?.amount ?? 0,
      transaction_amount: orderStatus?.transaction_amount ?? order?.amount ?? 0,
      paymentMode: orderStatus?.payment_mode || 'N/A',
      paymentTime: orderStatus?.payment_time,
      bankReference: orderStatus?.bank_reference || 'N/A',
      paymentMessage: orderStatus?.payment_message || '',
    };
  } catch (error) {
    this.logger.error('Error fetching transaction status', error);
    throw new BadRequestException('Failed to fetch transaction status');
  }
}
// Fetch all transactions
async getAllTransactions(page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  const transactions = await this.orderStatusModel.aggregate([
    {
      $lookup: {
        from: 'orders',
        localField: 'collect_id',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        collect_id: '$provider_collect_id',  // ✅ external ID
        school_id: '$order.school_id',
        gateway: '$order.gateway_name',
        order_amount: 1,
        transaction_amount: 1,
        status: 1,
        custom_order_id: 1,
      },
    },
  ]);

  return { page, limit, transactions };
}

// Fetch transactions by school
async getTransactionsBySchool(schoolId: string, page = 1, limit = 10) {
  const skip = (page - 1) * limit;

  const transactions = await this.orderStatusModel.aggregate([
    {
      $lookup: {
        from: 'orders',
        localField: 'collect_id',
        foreignField: '_id',
        as: 'order',
      },
    },
    { $unwind: '$order' },
    { $match: { 'order.school_id': new Types.ObjectId(schoolId) } },
    { $skip: skip },
    { $limit: limit },
    {
      $project: {
        _id: 0,
        collect_id: '$provider_collect_id',
        school_id: '$order.school_id',
        gateway: '$order.gateway_name',
        order_amount: 1,
        transaction_amount: 1,
        status: 1,
        custom_order_id: 1,
      },
    },
  ]);

  return { page, limit, transactions };
}


  // ✅ New method: update payment status (called by webhook)
 // ✅ New method: update payment status (called by webhook)
async updatePaymentStatus(orderId: string, gatewayStatus: string, details?: any) {
  try {
    // ✅ Normalize status
    const normalized: PaymentStatus = this.mapGatewayStatus(gatewayStatus);

    // 🔍 Fetch the order first so we always have a real ObjectId
// 🔍 Fetch the order first so we always have a real ObjectId
const searchConditions: Record<string, any>[] = [
  { custom_order_id: orderId },
  { 'metadata.collectRequestId': orderId },
  { 'metadata.collect_id': orderId },
  { order_id: orderId },
];

if (Types.ObjectId.isValid(orderId)) {
  searchConditions.push({ _id: new Types.ObjectId(orderId) });
}

this.logger.debug(`updatePaymentStatus() searching with conditions: ${JSON.stringify(searchConditions, null, 2)}`);

const order = await this.orderModel.findOne({ $or: searchConditions });

if (!order) {
  this.logger.warn(`updatePaymentStatus(): No order found for orderId=${orderId}`);
} else {
  this.logger.log(`updatePaymentStatus(): Found order -> _id=${order._id}, custom_order_id=${order.custom_order_id}`);
}


    if (!order) {
      this.logger.warn(`No order found for updatePaymentStatus: ${orderId}`);
      return null;
    }

    // ✅ Extract amounts
// ✅ Extract amounts safely
let transactionAmount =
  details?.transaction_amount ??
  details?.order_amount ??
  details?.orderAmount ??
  details?.amount ??
  0;

// ✅ Fallback: use the order’s original amount if webhook didn’t send any
if (!transactionAmount || transactionAmount === 0) {
  transactionAmount = order.amount ?? 0;
}


    // ✅ Extract payment time
    const paymentTime =
      details?.payment_time ??
      details?.paymentTime ??
      details?.txTime
        ? new Date(details.payment_time ?? details.paymentTime ?? details.txTime)
        : new Date();

    // ✅ Extract payment method
  const paymentMethod =
  details?.payment_mode ??         // direct
  details?.paymentMode ??          // camelCase
  details?.data?.payment_mode ??   // inside webhook.data
  'N/A';


    // ✅ Prepare update payload 
    const update: any = {
      collect_id: new Types.ObjectId(order._id),  
      provider_collect_id: details?.order_id || details?.collect_id || null, // ✅ store external reference // always ObjectId
      custom_order_id: order.custom_order_id,
      order_amount: transactionAmount,
      transaction_amount: transactionAmount,
      status: normalized,
      payment_time: paymentTime,
      payment_mode: paymentMethod,
      bank_reference: details?.referenceId ?? details?.bank_reference ?? 'N/A',
      payment_message: details?.payment_message ?? `Payment ${normalized}`,
      gateway_status: gatewayStatus,
      payment_details: details ? JSON.stringify(details) : undefined,
    };

   const updated = await this.orderStatusModel.findOneAndUpdate(
  {
    collect_id: order._id,   // ✅ always use ObjectId reference
  },
  { $set: update },
  { new: true, upsert: true }
);
    this.logger.log(
      `Updated payment status for ${order._id}: ${normalized}, amount: ${transactionAmount}`,
    );

    // ✅ ALSO sync into orders.metadata so frontend simulator always shows latest
    try {
      await this.orderModel.updateOne(
        { _id: order._id },
        {
          $set: {
            'metadata.lastWebhookUpdate': new Date(),
            'metadata.paymentStatus': normalized,
            'metadata.bankReference': update.bank_reference,
            'metadata.transactionId':
              details?.transaction_id || details?.cf_payment_id || null,
          },
        },
      );
    } catch (e) {
      this.logger.warn(
        'Failed to sync order metadata after status update',
        e.message || e,
      );
    }

    return updated;
  } catch (err) {
    this.logger.error(
      `Failed to update payment status for ${orderId}:`,
      err?.response?.data ?? err.message ?? err,
    );
    throw err;
  }
}

}


