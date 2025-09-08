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

    private mapGatewayStatus(gatewayStatus: string): string {
    switch (gatewayStatus?.toLowerCase()) {
      case 'success':
        return 'paid';
      case 'failure':
      case 'failed':
        return 'failed';
      case 'pending':
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
        const apiUrl = this.configService.get('PAYMENT_API_URL') || 
          'https://dev-vanilla.edviron.com/erp/create-collect-request';
        
        const apiKey = this.configService.get('API_KEY');
        
        this.logger.log('=== EXTERNAL API CALL DEBUG ===');
        this.logger.log('API URL:', apiUrl);
        this.logger.log('API Key present:', apiKey ? 'Yes' : 'No');
        this.logger.log('Request payload:', JSON.stringify(requestBody, null, 2));
        
        const response = await firstValueFrom(
          this.httpService.post(apiUrl, requestBody, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
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

        // Step 5: Validate external API response
        if (!resData.collect_request_url) {
          this.logger.error('=== MISSING PAYMENT URL ===');
          this.logger.error('Expected field: collect_request_url');
          this.logger.error('Available fields:', Object.keys(resData));
          this.logger.error('Full response:', resData);
          throw new Error('Payment URL not received from external API');
        }

        // Step 6: Save order status
        await this.orderStatusModel.create({
          collect_id: order._id,
          order_amount: amount,
          collect_request_id: resData.collect_request_id,
          transaction_amount: amount,
          status: this.mapGatewayStatus(resData.status || 'pending'),
          payment_mode: 'N/A',
          payment_details: 'payment_initiated',
          bank_reference: 'N/A',
          payment_message: 'Payment initiated',
          error_message: 'N/A',
          payment_time: new Date(),
        });

        this.logger.log('Order status saved successfully');

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
      const orderStatus = await this.orderStatusModel.findOne({
        collect_id: customOrderId,
      });
      if (!orderStatus) {
        return { customOrderId, status: 'not_found' };
      }

      return {
        customOrderId,
        status: orderStatus.status,
        orderAmount: orderStatus.order_amount,
        transactionAmount: orderStatus.transaction_amount,
        paymentMode: orderStatus.payment_mode,
        paymentTime: orderStatus.payment_time,
        bankReference: orderStatus.bank_reference,
        paymentMessage: orderStatus.payment_message,
      };
    } catch (error) {
      this.logger.error('Error fetching payment status', error);
      throw new BadRequestException('Failed to fetch payment status');
    }
  }

  // Fetch transaction details for collect-payment route
  async collectPaymentStatus(customOrderId: string) {
    try {
      const orderStatus = await this.orderStatusModel.findOne({
        collect_id: customOrderId,
      });
      if (!orderStatus) {
        return { customOrderId, status: 'not_found' };
      }

      return {
        customOrderId,
        status: orderStatus.status,
        orderAmount: orderStatus.order_amount,
        transactionAmount: orderStatus.transaction_amount,
        paymentMode: orderStatus.payment_mode,
        paymentTime: orderStatus.payment_time,
        bankReference: orderStatus.bank_reference,
        paymentMessage: orderStatus.payment_message,
      };
    } catch (error) {
      this.logger.error('Error fetching transaction status', error);
      throw new BadRequestException('Failed to fetch transaction status');
    }
  }

  // ✅ New method: update payment status (called by webhook)
async updatePaymentStatus(orderId: string, status: string, details?: any) {
  const normalized = this.mapGatewayStatus(status);
  const update = {
    status: normalized,
    payment_message: details?.Payment_message || `Payment ${normalized}`,
    transaction_amount: details?.transaction_amount ?? details?.order_amount ?? undefined,
    bank_reference: details?.bank_reference ?? details?.bankReference ?? undefined,
    payment_mode: details?.payment_mode ?? details?.paymentMode ?? 'N/A',
    payment_time: details?.payment_time ?? details?.paymentTime ?? new Date(),
    gateway_status: status, // store raw original
    payment_details: JSON.stringify(details ?? {}),
    error_message: details?.error_message ?? details?.errorMessage ?? 'N/A',
  };
  const orderStatus = await this.orderStatusModel.findOneAndUpdate(
    { collect_request_id: orderId },
    { $set: update },
    { new: true, upsert: false }
  );
  
}

}
