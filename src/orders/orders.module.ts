import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from '../schemas/order.schema';
import { OrderStatus, OrderStatusSchema } from '../schemas/order-status.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: OrderStatus.name, schema: OrderStatusSchema },
    ]),
  ],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}

// ===== 5. USAGE EXAMPLES =====

/*
// Create Order Example:
POST /orders
{
  "school_id": "65b0e6293e9f76a9694d84b4",
  "trustee_id": "65b0e552dd31950a9b41c5ba",
  "student_info": {
    "name": "John Doe",
    "id": "STU001",
    "email": "john.doe@example.com"
  },
  "gateway_name": "PhonePe",
  "amount": 1000,
  "description": "Tuition Fee",
  "callback_url": "https://yoursite.com/callback"
}

// Get All Orders with Filters:
GET /orders?page=1&limit=10&status=success&school_id=65b0e6293e9f76a9694d84b4&sort=-payment_time&search=John

// Get Orders by School:
GET /orders/school/65b0e6293e9f76a9694d84b4?page=1&limit=10

// Get Single Order:
GET /orders/507f1f77bcf86cd799439011

// Update Order:
PATCH /orders/507f1f77bcf86cd799439011
{
  "gateway_name": "Razorpay",
  "student_info": {
    "name": "John Updated",
    "id": "STU001",
    "email": "john.updated@example.com"
  }
}

// Delete Order:
DELETE /orders/507f1f77bcf86cd799439011

// Get Statistics:
GET /orders/stats?school_id=65b0e6293e9f76a9694d84b4
*/