import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderStatusDocument = OrderStatus & Document;

@Schema({ timestamps: true })
export class OrderStatus {
  @Prop({ required: true, index: true })
  custom_order_id: string;  // internal unique ID

  @Prop()
  collect_request_id?: string;  // gateway request ID

  @Prop({ type: Types.ObjectId, ref: 'Order', required: true })
  collect_id: Types.ObjectId;   // reference to Order

  @Prop()
  provider_collect_id?: string; // raw provider ID

  @Prop({ type: Number })
  order_amount: number;

  @Prop({ type: Number })
  transaction_amount: number;

  @Prop({ type: String, default: 'pending', index: true })
  status: string; // normalized status

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
  gateway_status?: string; // raw gateway status

  @Prop()
  capture_status?: string;

  @Prop()
  payment_details?: string;

  @Prop({ type: Object })
  metadata?: Record<string, any>;
}

export const OrderStatusSchema = SchemaFactory.createForClass(OrderStatus);

// ✅ Useful indexes
OrderStatusSchema.index({ custom_order_id: 1 });
OrderStatusSchema.index({ collect_id: 1 });
OrderStatusSchema.index({ status: 1 });
OrderStatusSchema.index({ payment_time: -1 });
