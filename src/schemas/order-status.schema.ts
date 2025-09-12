import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';  

export type OrderStatusDocument = OrderStatus & Document;

@Schema({ timestamps: true })
export class OrderStatus {
  @Prop({ required: true, index: true })
  custom_order_id: string;   // 👈 important, used in your service

  @Prop()
  collect_request_id?: string;  // 👈 optional but supported

@Prop({ type: 'ObjectId', ref: 'Order', required: true })
collect_id: Types.ObjectId;

@Prop()
provider_collect_id?: string; // 👈 string version (gateway ref)

  @Prop()
  order_id?: string;            // 👈 fallback

  @Prop({ type: Number })
  order_amount: number;

  @Prop({ type: Number })
  transaction_amount: number;

  @Prop({ type: String, default: 'pending', index: true })
  status: string;

  @Prop({ type: Date })
  payment_time?: Date;

  @Prop()
  payment_mode?: string;

  @Prop()
  payment_message?: string;

  @Prop()
  error_message?: string;

  @Prop()
  bank_reference?: string;

  @Prop()
  gateway_status?: string;

  @Prop()
  capture_status?: string;

  @Prop()
  payment_details?: string;
   @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const OrderStatusSchema = SchemaFactory.createForClass(OrderStatus);

// Indexes for queries
OrderStatusSchema.index({ custom_order_id: 1 });
OrderStatusSchema.index({ collect_id: 1 });
OrderStatusSchema.index({ status: 1 });
OrderStatusSchema.index({ payment_time: -1 });
