import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { JwtService } from '@nestjs/jwt';
import { firstValueFrom } from 'rxjs';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name) private orderStatusModel: Model<OrderStatusDocument>,
    private httpService: HttpService,
    private configService: ConfigService,
    private jwtService: JwtService,
  ) {}

  // Create payment request
  async createPayment(createPaymentDto: any) {
     try {
    const { student_info } = createPaymentDto;
    const order = new this.orderModel({
      school_id: new Types.ObjectId(this.configService.get('SCHOOL_ID')),
      trustee_id: new Types.ObjectId('65b0e552dd31950a9b41c5ba'),
      student_info: {
        name: student_info.name,
        id: student_info.id,
        email: student_info.email,
      },
      gateway_name: createPaymentDto.gateway || 'edviron',
    });

    await order.save();

      // Prepare payment request payload
      const paymentPayload = {
        school_id: this.configService.get('SCHOOL_ID'),
        amount: createPaymentDto.amount.toString(),
        callback_url:
          createPaymentDto.returnUrl || `${this.configService.get('FRONTEND_URL')}/payments/status`,
      };

      // Sign the payload with PG_KEY
      const sign = this.jwtService.sign(paymentPayload, {
        secret: this.configService.get('PG_KEY'),
        algorithm: 'HS256',
      });

      const requestBody = {
        ...paymentPayload,
        sign,
      };

      // Call external payment API
      const response = await firstValueFrom(
        this.httpService.post(
          'https://dev-vanilla.edviron.com/erp/create-collect-request',
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${this.configService.get('API_KEY')}`,
            },
          },
        ),
      );

      // Create initial order status
      await this.orderStatusModel.create({
        collect_id: order._id,
        order_amount: createPaymentDto.amount,
        collect_request_id: response.data.collect_request_id,
        transaction_amount: createPaymentDto.amount,
        payment_mode: 'pending',
        payment_details: 'payment_initiated',
        bank_reference: 'NA',
        payment_message: 'Payment request created',
        status: 'pending',
        error_message: 'NA',
        payment_time: new Date(),
      });

      return {
        order_id: order._id,
        collect_request_id: response.data.collect_request_id,
        payment_url: response.data.Collect_request_url,
        sign: response.data.sign,
      };
    } catch (error) {
      this.logger.error('Payment creation failed:', error);
      throw new BadRequestException('Payment creation failed');
    }
  }

  // Fetch transaction status by custom order ID
  async getPaymentStatus(customOrderId: string) {
    try {
      const orderStatus = await this.orderStatusModel.findOne({ collect_id: customOrderId });
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
      const orderStatus = await this.orderStatusModel.findOne({ collect_id: customOrderId });
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
}
