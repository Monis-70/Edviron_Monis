import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus, OrderStatusDocument } from '../schemas/order-status.schema';
import { GetTransactionsDto } from './dto/get-transactions.dto';
import { TransactionFiltersDto } from './dto/transaction-filters.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<OrderDocument>,
    @InjectModel(OrderStatus.name) private orderStatusModel: Model<OrderStatusDocument>,
  ) {}

  async getAllTransactions(query: GetTransactionsDto) {
    const {
      page = 1,
      limit = 10,
      sort = 'created_at',
      order = 'desc',
      status,
      gateway,
      startDate,
      endDate,
      minAmount,
      maxAmount,
      search,
    } = query;

    const pipeline: any[] = [];

    pipeline.push({
      $lookup: {
        from: 'order_status',
        localField: '_id',
        foreignField: 'collect_id',
        as: 'status_info',
      },
    });

    pipeline.push({
      $unwind: {
        path: '$status_info',
        preserveNullAndEmptyArrays: true,
      },
    });

    pipeline.push({
      $addFields: {
        collect_id: '$_id',
        order_amount: '$status_info.order_amount',
        transaction_amount: '$status_info.transaction_amount',
        status: { $ifNull: ['$status_info.status', 'pending'] },
        payment_mode: '$status_info.payment_mode',
        payment_time: '$status_info.payment_time',
        payment_message: '$status_info.payment_message',
        bank_reference: '$status_info.bank_reference',
      },
    });

    const matchStage: any = {};

    if (status) {
      matchStage.status = status;
    }

    if (gateway) {
      matchStage.gateway_name = gateway;
    }

    if (startDate || endDate) {
      matchStage.created_at = {};
      if (startDate) {
        matchStage.created_at.$gte = new Date(startDate);
      }
      if (endDate) {
        matchStage.created_at.$lte = new Date(endDate);
      }
    }

    if (minAmount || maxAmount) {
      matchStage.order_amount = {};
      if (minAmount) {
        matchStage.order_amount.$gte = minAmount;
      }
      if (maxAmount) {
        matchStage.order_amount.$lte = maxAmount;
      }
    }

    if (search) {
      matchStage.$or = [
        { custom_order_id: { $regex: search, $options: 'i' } },
        { 'student_info.name': { $regex: search, $options: 'i' } },
        { 'student_info.email': { $regex: search, $options: 'i' } },
        { bank_reference: { $regex: search, $options: 'i' } },
      ];
    }

    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    const sortField = this.mapSortField(sort);
    const sortOrder = order === 'desc' ? -1 : 1;
    const skip = (page - 1) * limit;

    pipeline.push({
      $facet: {
        metadata: [
          { $count: 'total' },
          {
            $addFields: {
              page: page,
              limit: limit,
              pages: { $ceil: { $divide: ['$total', limit] } },
            },
          },
        ],
        data: [
          { $sort: { [sortField]: sortOrder } },
          { $skip: skip },
          { $limit: limit },
          {
            $project: {
              collect_id: 1,
              school_id: 1,
              gateway: '$gateway_name',
              order_amount: 1,
              transaction_amount: 1,
              status: 1,
              custom_order_id: 1,
              student_info: 1,
              payment_mode: 1,
              payment_time: 1,
              payment_message: 1,
              bank_reference: 1,
              created_at: 1,
              updated_at: 1,
            },
          },
        ],
        summary: [
          {
            $group: {
              _id: null,
              totalAmount: { $sum: '$order_amount' },
              totalTransactionAmount: { $sum: '$transaction_amount' },
              averageAmount: { $avg: '$order_amount' },
              successCount: {
                $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
              },
              failedCount: {
                $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
              },
              pendingCount: {
                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
              },
            },
          },
        ],
      },
    });

    pipeline.push({
      $project: {
        data: 1,
        pagination: { $arrayElemAt: ['$metadata', 0] },
        summary: { $arrayElemAt: ['$summary', 0] },
      },
    });

    const result = await this.orderModel.aggregate(pipeline);
    const response = result[0] || { data: [], pagination: null, summary: null };

    const formattedResponse = {
      success: true,
      data: response.data,
      pagination: response.pagination || {
        total: 0,
        page: page,
        limit: limit,
        pages: 0,
      },
      summary: response.summary || {
        totalAmount: 0,
        totalTransactionAmount: 0,
        averageAmount: 0,
        successCount: 0,
        failedCount: 0,
        pendingCount: 0,
      },
    };

    return formattedResponse;
  }

  async getTransactionsBySchool(schoolId: string, filters: TransactionFiltersDto) {
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      sort = 'created_at',
      order = 'desc',
    } = filters;

    if (!Types.ObjectId.isValid(schoolId)) {
      throw new NotFoundException('Invalid school ID');
    }

    const pipeline: any[] = [];

    pipeline.push({
      $match: { school_id: new Types.ObjectId(schoolId) },
    });

    pipeline.push({
      $lookup: {
        from: 'order_status',
        localField: '_id',
        foreignField: 'collect_id',
        as: 'status_info',
      },
    });

    pipeline.push({
      $unwind: {
        path: '$status_info',
        preserveNullAndEmptyArrays: true,
      },
    });

    const matchFilters: any = {};

    if (status) {
      matchFilters['status_info.status'] = status;
    }

    if (startDate || endDate) {
      matchFilters.created_at = {};
      if (startDate) {
        matchFilters.created_at.$gte = new Date(startDate);
      }
      if (endDate) {
        matchFilters.created_at.$lte = new Date(endDate);
      }
    }

    if (Object.keys(matchFilters).length > 0) {
      pipeline.push({ $match: matchFilters });
    }

    pipeline.push({
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
          status: '$status_info.status',
        },
        count: { $sum: 1 },
        totalAmount: { $sum: '$status_info.order_amount' },
        transactions: {
          $push: {
            collect_id: '$_id',
            custom_order_id: '$custom_order_id',
            student_info: '$student_info',
            amount: '$status_info.order_amount',
            status: '$status_info.status',
            payment_time: '$status_info.payment_time',
            gateway: '$gateway_name',
          },
        },
      },
    });

    const sortField = order === 'desc' ? -1 : 1;
    pipeline.push({ $sort: { '_id.date': sortField } });

    const skip = (page - 1) * limit;
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    const [transactions, totalCount] = await Promise.all([
      this.orderModel.aggregate(pipeline),
      this.orderModel.countDocuments({ school_id: new Types.ObjectId(schoolId) }),
    ]);

    return {
      success: true,
      schoolId,
      data: transactions,
      pagination: {
        total: totalCount,
        page,
        limit,
        pages: Math.ceil(totalCount / limit),
      },
    };
  }

  async getTransactionStatus(customOrderId: string) {
    const order = await this.orderModel.findOne({ custom_order_id: customOrderId });

    if (!order) {
      throw new NotFoundException('Transaction not found');
    }

    const orderStatus = await this.orderStatusModel.findOne({ 
      collect_id: order._id 
    });

    const response = {
      success: true,
      transaction: {
        customOrderId: order.custom_order_id,
        schoolId: order.school_id,
        studentInfo: order.student_info,
        gateway: order.gateway_name,
        createdAt: order.created_at,
        status: orderStatus?.status || 'pending',
        amount: orderStatus?.order_amount || 0,
        transactionAmount: orderStatus?.transaction_amount || 0,
        paymentMode: orderStatus?.payment_mode || null,
        paymentTime: orderStatus?.payment_time || null,
        bankReference: orderStatus?.bank_reference || null,
        paymentMessage: orderStatus?.payment_message || null,
        errorMessage: orderStatus?.error_message || null,
      },
    };

    return response;
  }

  async getTransactionAnalytics(filters: any) {
    const pipeline: any[] = [];

    pipeline.push({
      $lookup: {
        from: 'order_status',
        localField: '_id',
        foreignField: 'collect_id',
        as: 'status_info',
      },
    });

    pipeline.push({
      $unwind: {
        path: '$status_info',
        preserveNullAndEmptyArrays: true,
      },
    });

    if (filters.startDate || filters.endDate) {
      const dateMatch: any = {};
      if (filters.startDate) {
        dateMatch.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        dateMatch.$lte = new Date(filters.endDate);
      }
      pipeline.push({ $match: { created_at: dateMatch } });
    }

    pipeline.push({
      $facet: {
        dailyTrends: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$created_at' } },
              count: { $sum: 1 },
              totalAmount: { $sum: '$status_info.order_amount' },
              successCount: {
                $sum: { $cond: [{ $eq: ['$status_info.status', 'success'] }, 1, 0] },
              },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 30 },
        ],
        gatewayDistribution: [
          {
            $group: {
              _id: '$gateway_name',
              count: { $sum: 1 },
              totalAmount: { $sum: '$status_info.order_amount' },
              successRate: {
                $avg: { $cond: [{ $eq: ['$status_info.status', 'success'] }, 1, 0] },
              },
            },
          },
        ],
        paymentModes: [
          {
            $group: {
              _id: '$status_info.payment_mode',
              count: { $sum: 1 },
              totalAmount: { $sum: '$status_info.order_amount' },
            },
          },
        ],
        schoolStats: [
          {
            $group: {
              _id: '$school_id',
              transactionCount: { $sum: 1 },
              totalRevenue: { $sum: '$status_info.order_amount' },
              averageTransactionValue: { $avg: '$status_info.order_amount' },
            },
          },
          { $sort: { totalRevenue: -1 } },
          { $limit: 10 },
        ],
        overallStats: [
          {
            $group: {
              _id: null,
              totalTransactions: { $sum: 1 },
              totalRevenue: { $sum: '$status_info.order_amount' },
              averageTransactionValue: { $avg: '$status_info.order_amount' },
              successRate: {
                $avg: { $cond: [{ $eq: ['$status_info.status', 'success'] }, 1, 0] },
              },
              uniqueStudents: { $addToSet: '$student_info.id' },
            },
          },
          {
            $project: {
              totalTransactions: 1,
              totalRevenue: 1,
              averageTransactionValue: 1,
              successRate: { $multiply: ['$successRate', 100] },
              uniqueStudentCount: { $size: '$uniqueStudents' },
            },
          },
        ],
      },
    });

    const result = await this.orderModel.aggregate(pipeline);
    return {
      success: true,
      analytics: result[0],
      generatedAt: new Date(),
    };
  }

  async exportTransactions(format: 'csv' | 'json' | 'pdf', filters: any) {
    const transactions = await this.getAllTransactions({
      ...filters,
      limit: 10000,
    });

    switch (format) {
      case 'csv':
        return this.exportAsCSV(transactions.data);
      case 'json':
        return transactions.data;
      case 'pdf':
        return this.exportAsPDF(transactions.data);
      default:
        throw new Error('Unsupported export format');
    }
  }

  private exportAsCSV(data: any[]): string {
    if (!data || data.length === 0) {
      return 'No data to export';
    }

    const headers = [
      'Order ID',
      'Student Name',
      'Student Email',
      'Amount',
      'Status',
      'Payment Mode',
      'Gateway',
      'Bank Reference',
      'Payment Time',
      'Created At',
    ];

    const rows = data.map(item => [
      item.custom_order_id,
      item.student_info?.name || '',
      item.student_info?.email || '',
      item.order_amount,
      item.status,
      item.payment_mode || '',
      item.gateway,
      item.bank_reference || '',
      item.payment_time || '',
      item.created_at,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\n');

    return csvContent;
  }

  private async exportAsPDF(data: any[]): Promise<Buffer> {
    throw new Error('PDF export not yet implemented');
  }

  private mapSortField(field: string): string {
    const fieldMap = {
      'created_at': 'created_at',
      'payment_time': 'status_info.payment_time',
      'amount': 'status_info.order_amount',
      'status': 'status_info.status',
      'custom_order_id': 'custom_order_id',
    };
    return fieldMap[field] || 'created_at';
  }
}