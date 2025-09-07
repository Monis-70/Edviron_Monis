import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderStatusDocument = OrderStatus & Document;

@Schema({
  timestamps: true,
  collection: 'order_status',
})
export class OrderStatus {
  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  collect_id: Types.ObjectId;

  @Prop({ required: true })
  order_amount: number;

  @Prop({ required: true })
  transaction_amount: number;

  @Prop({ required: true })
  payment_mode: string;

  @Prop()
  payment_details: string;

  @Prop()
  bank_reference: string;

  @Prop()
  payment_message: string;

  @Prop({ 
    required: true, 
    enum: ['pending', 'processing', 'success', 'failed', 'cancelled'],
    default: 'pending'
  })
  status: string;

  @Prop()
  error_message: string;

  @Prop()
  payment_time: Date;

  @Prop({ default: 0 })
  retry_count: number;

  @Prop()
  last_retry_at: Date;
}

export const OrderStatusSchema = SchemaFactory.createForClass(OrderStatus);
OrderStatusSchema.index({ collect_id: 1 });
OrderStatusSchema.index({ status: 1 });
OrderStatusSchema.index({ payment_time: -1 });