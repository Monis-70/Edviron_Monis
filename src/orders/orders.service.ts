import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name) private orderStatusModel: Model<OrderStatusDocument>,
  ) {}

  async create(createOrderDto: CreateOrderDto): Promise<Order> {
    try {
      const orderData = {
        school_id: new Types.ObjectId(createOrderDto.school_id),
        trustee_id: new Types.ObjectId(createOrderDto.trustee_id),
        student_info: createOrderDto.student_info,
        gateway_name: createOrderDto.gateway_name,
      };

      const createdOrder = new this.orderModel(orderData);
      const savedOrder = await createdOrder.save();

      // Create initial order status
      await this.orderStatusModel.create({
        collect_id: savedOrder._id,
        order_amount: createOrderDto.amount,
        transaction_amount: createOrderDto.amount,
        payment_mode: 'pending',
        payment_details: 'order_created',
        bank_reference: 'NA',
        payment_message: 'Order created successfully',
        status: 'pending',
        error_message: 'NA',
        payment_time: new Date(),
      });

      this.logger.log(`Order created: ${savedOrder._id}`);
      return savedOrder;
    } catch (error) {
      this.logger.error('Error creating order:', error);
      throw new BadRequestException('Failed to create order');
    }
  }

  async findAll(queryDto: QueryOrderDto) {
    try {
      const { page = 1, limit = 10, sort = '-payment_time', status, school_id, gateway, start_date, end_date, search } = queryDto;
      const skip = (page - 1) * limit;

      // Build match stage
      const matchStage: Record<string, any> = {};

      if (school_id) matchStage.school_id = new Types.ObjectId(school_id);
      if (gateway) matchStage.gateway_name = { $regex: gateway, $options: 'i' };
      if (start_date || end_date) {
        matchStage.createdAt = {};
        if (start_date) matchStage.createdAt.$gte = new Date(start_date);
        if (end_date) matchStage.createdAt.$lte = new Date(end_date);
      }
      if (search) {
        matchStage.$or = [
          { 'student_info.name': { $regex: search, $options: 'i' } },
          { 'student_info.email': { $regex: search, $options: 'i' } },
          { 'student_info.id': { $regex: search, $options: 'i' } },
        ];
      }

      // Aggregation pipeline
      const pipeline: any[] = [ // <-- changed from PipelineStage[] to any[]
        { $match: matchStage },
        {
          $lookup: {
            from: 'orderstatuses',
            localField: '_id',
            foreignField: 'collect_id',
            as: 'order_status',
          },
        },
        { $unwind: { path: '$order_status', preserveNullAndEmptyArrays: true } },
      ];

      // Status filter
      if (status) {
        pipeline.push({ $match: { 'order_status.status': status } });
      }

      // Projection
      pipeline.push({
        $project: {
          collect_id: '$_id',
          school_id: '$school_id',
          gateway: '$gateway_name',
          order_amount: '$order_status.order_amount',
          transaction_amount: '$order_status.transaction_amount',
          status: '$order_status.status',
          custom_order_id: '$_id',
          payment_time: '$order_status.payment_time',
          payment_mode: '$order_status.payment_mode',
          payment_details: '$order_status.payment_details',
          bank_reference: '$order_status.bank_reference',
          payment_message: '$order_status.payment_message',
          error_message: '$order_status.error_message',
          student_info: '$student_info',
          trustee_id: '$trustee_id',
          createdAt: '$createdAt',
          updatedAt: '$updatedAt',
        },
      });

      // Sorting
      const sortObject: Record<string, 1 | -1> = this.buildSortObject(sort);
      pipeline.push({ $sort: sortObject });

      // Count total documents before pagination
      const countPipeline: any[] = [...pipeline, { $count: 'total' }]; // <-- changed

      // Pagination
      pipeline.push({ $skip: skip }, { $limit: limit });

      // Execute both queries in parallel
      const [orders, countResult] = await Promise.all([
        this.orderModel.aggregate(pipeline),
        this.orderModel.aggregate(countPipeline),
      ]);

      const total = countResult[0]?.total || 0;

      return {
        orders,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
        filters: { status, school_id, gateway, start_date, end_date, search },
      };
    } catch (error) {
      this.logger.error('Error fetching orders:', error);
      throw new BadRequestException('Failed to fetch orders');
    }
  }

  async findBySchool(schoolId: string, queryDto: QueryOrderDto) {
    try {
      const modifiedQuery = { ...queryDto, school_id: schoolId };
      return this.findAll(modifiedQuery);
    } catch (error) {
      this.logger.error(`Error fetching orders for school ${schoolId}:`, error);
      throw new BadRequestException('Failed to fetch school orders');
    }
  }

  async findOne(id: string): Promise<any> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new BadRequestException('Invalid order ID format');
      }

      const pipeline: any[] = [ // <-- changed
        { $match: { _id: new Types.ObjectId(id) } },
        {
          $lookup: {
            from: 'orderstatuses',
            localField: '_id',
            foreignField: 'collect_id',
            as: 'order_status'
          }
        },
        {
          $unwind: {
            path: '$order_status',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $project: {
            collect_id: '$_id',
            school_id: '$school_id',
            trustee_id: '$trustee_id',
            student_info: '$student_info',
            gateway: '$gateway_name',
            order_amount: '$order_status.order_amount',
            transaction_amount: '$order_status.transaction_amount',
            status: '$order_status.status',
            custom_order_id: '$_id',
            payment_time: '$order_status.payment_time',
            payment_mode: '$order_status.payment_mode',
            payment_details: '$order_status.payment_details',
            bank_reference: '$order_status.bank_reference',
            payment_message: '$order_status.payment_message',
            error_message: '$order_status.error_message',
            createdAt: '$createdAt',
            updatedAt: '$updatedAt',
          }
        }
      ];

      const result = await this.orderModel.aggregate(pipeline);
      
      if (!result.length) {
        throw new NotFoundException(`Order with ID ${id} not found`);
      }

      return result[0];
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error fetching order ${id}:`, error);
      throw new BadRequestException('Failed to fetch order');
    }
  }

  async findByCustomOrderId(customOrderId: string) {
    try {
      return this.findOne(customOrderId);
    } catch (error) {
      this.logger.error(`Error fetching order by custom ID ${customOrderId}:`, error);
      throw error;
    }
  }


  async update(id: string, updateOrderDto: UpdateOrderDto): Promise<Order> {
    try {
      if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid order ID format');

      const updateData: any = { ...updateOrderDto };
      if (updateOrderDto.school_id) updateData.school_id = new Types.ObjectId(updateOrderDto.school_id);
      if (updateOrderDto.trustee_id) updateData.trustee_id = new Types.ObjectId(updateOrderDto.trustee_id);

      const updatedOrder = await this.orderModel.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!updatedOrder) throw new NotFoundException(`Order with ID ${id} not found`);

      this.logger.log(`Order updated: ${id}`);
      return updatedOrder;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error updating order ${id}:`, error);
      throw new BadRequestException('Failed to update order');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(id)) throw new BadRequestException('Invalid order ID format');

      const order = await this.orderModel.findById(id);
      if (!order) throw new NotFoundException(`Order with ID ${id} not found`);

      await this.orderStatusModel.deleteMany({ collect_id: order._id });
      await this.orderModel.findByIdAndDelete(id);

      this.logger.log(`Order deleted: ${id}`);
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error deleting order ${id}:`, error);
      throw new BadRequestException('Failed to delete order');
    }
  }

  async getOrderStats(schoolId?: string) {
    try {
      const matchStage = schoolId ? { school_id: new Types.ObjectId(schoolId) } : {};

      const pipeline: any[] = [ // <-- changed
        { $match: matchStage },
        { $lookup: { from: 'orderstatuses', localField: '_id', foreignField: 'collect_id', as: 'status' } },
        { $unwind: { path: '$status', preserveNullAndEmptyArrays: true } },
        { $group: { _id: '$status.status', count: { $sum: 1 }, total_amount: { $sum: '$status.order_amount' }, avg_amount: { $avg: '$status.order_amount' } } },
        { $group: { _id: null, stats: { $push: { status: '$_id', count: '$count', total_amount: '$total_amount', avg_amount: '$avg_amount' } }, total_orders: { $sum: '$count' }, total_revenue: { $sum: '$total_amount' } } }
      ];

      const result = await this.orderModel.aggregate(pipeline);
      return result[0] || { stats: [], total_orders: 0, total_revenue: 0 };
    } catch (error) {
      this.logger.error('Error fetching order stats:', error);
      throw new BadRequestException('Failed to fetch order statistics');
    }
  }

  private buildSortObject(sort: string): Record<string, 1 | -1> {
    const direction = sort.startsWith('-') ? -1 : 1;
    const field = sort.replace('-', '');

    const fieldMapping = {
      'payment_time': 'order_status.payment_time',
      'status': 'order_status.status',
      'amount': 'order_status.order_amount',
      'gateway': 'gateway_name',
      'student_name': 'student_info.name',
      'createdAt': 'createdAt',
      'updatedAt': 'updatedAt',
    };

    const dbField = fieldMapping[field] || field;
    return { [dbField]: direction };
  }
}
