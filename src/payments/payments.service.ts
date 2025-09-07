import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import { firstValueFrom } from 'rxjs';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly paymentApiUrl: string;
  private readonly pgKey: string;
  private readonly apiKey: string;
  private readonly schoolId: string;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name) private orderStatusModel: Model<OrderStatusDocument>,
  ) {
    this.paymentApiUrl = this.configService.get<string>('PAYMENT_API_BASE_URL');
    this.pgKey = this.configService.get<string>('PG_KEY');
    this.apiKey = this.configService.get<string>('API_KEY');
    this.schoolId = this.configService.get<string>('SCHOOL_ID');
  }

  async createPayment(createPaymentDto: CreatePaymentDto, userId: string) {
    try {
      const customOrderId = `ORD_${Date.now()}_${uuidv4().slice(0, 8)}`;

      const order = await this.orderModel.create({
        school_id: new Types.ObjectId(this.schoolId),
        trustee_id: new Types.ObjectId(userId),
        student_info: createPaymentDto.studentInfo,
        gateway_name: createPaymentDto.gateway || 'PhonePe',
        custom_order_id: customOrderId,
        metadata: {
          amount: createPaymentDto.amount,
          description: createPaymentDto.description,
          feeType: createPaymentDto.feeType,
        },
      });

      await this.orderStatusModel.create({
        collect_id: order._id,
        order_amount: createPaymentDto.amount,
        transaction_amount: createPaymentDto.amount,
        status: 'pending',
        payment_mode: 'pending',
      });

      const paymentPayload = this.preparePaymentPayload(
        createPaymentDto,
        customOrderId,
        order._id.toString(),
      );

      const signedPayload = this.signPayload(paymentPayload);
      const paymentResponse = await this.callPaymentGatewayAPI(signedPayload);

      await this.orderModel.findByIdAndUpdate(order._id, {
        $set: {
          'metadata.gatewayOrderId': paymentResponse.gatewayOrderId,
          'metadata.paymentUrl': paymentResponse.paymentUrl,
        },
      });

      this.logger.log(`Payment created successfully: ${customOrderId}`);

      return {
        success: true,
        orderId: customOrderId,
        paymentUrl: paymentResponse.paymentUrl,
        gatewayOrderId: paymentResponse.gatewayOrderId,
        message: 'Payment initiated successfully',
      };
    } catch (error) {
      this.logger.error('Error creating payment:', error);
      throw new BadRequestException(
        error.response?.data?.message || 'Failed to create payment',
      );
    }
  }

  private preparePaymentPayload(
    dto: CreatePaymentDto,
    customOrderId: string,
    orderId: string,
  ) {
    return {
      pg_key: this.pgKey,
      custom_order_id: customOrderId,
      collect_id: orderId,
      school_id: this.schoolId,
      amount: dto.amount,
      fee_type: dto.feeType || 'tuition',
      student_info: {
        name: dto.studentInfo.name,
        id: dto.studentInfo.id,
        email: dto.studentInfo.email,
        phone: dto.studentInfo.phone || '',
        class: dto.studentInfo.class || '',
        section: dto.studentInfo.section || '',
      },
      payment_for: dto.description || 'School Fee Payment',
      gateway: dto.gateway || 'PhonePe',
      return_url: dto.returnUrl || `${this.configService.get('APP_URL')}/payment/success`,
      webhook_url: `${this.configService.get('APP_URL')}/webhook`,
      metadata: {
        source: 'school-payment-api',
        timestamp: new Date().toISOString(),
        ...dto.metadata,
      },
    };
  }

  private signPayload(payload: any): string {
    return jwt.sign(payload, this.apiKey, {
      algorithm: 'HS256',
      expiresIn: '1h',
    });
  }

  private async callPaymentGatewayAPI(signedPayload: string) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'X-API-Key': this.apiKey,
        'X-PG-Key': this.pgKey,
      };

      const requestBody = {
        data: signedPayload,
        type: 'create-collect-request',
      };

      const response = await firstValueFrom(
        this.httpService.post(
          `${this.paymentApiUrl}/create-collect-request`,
          requestBody,
          { headers },
        ),
      );

      if (response.data.success) {
        return {
          gatewayOrderId: response.data.data.gateway_order_id,
          paymentUrl: response.data.data.payment_url,
          transactionId: response.data.data.transaction_id,
        };
      } else {
        throw new Error(response.data.message || 'Payment gateway error');
      }
    } catch (error) {
      this.logger.error('Payment gateway API error:', error);
      throw error;
    }
  }

  async getPaymentStatus(customOrderId: string) {
    const order = await this.orderModel.findOne({ custom_order_id: customOrderId });
    
    if (!order) {
      throw new BadRequestException('Order not found');
    }

    const orderStatus = await this.orderStatusModel.findOne({ 
      collect_id: order._id 
    });

    return {
      orderId: customOrderId,
      status: orderStatus?.status || 'pending',
      amount: orderStatus?.order_amount,
      transactionAmount: orderStatus?.transaction_amount,
      paymentMode: orderStatus?.payment_mode,
      paymentTime: orderStatus?.payment_time,
      message: orderStatus?.payment_message,
    };
  }
}