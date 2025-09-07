import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type OrderDocument = Order & Document;

@Schema({
  timestamps: true,
  collection: 'orders',
})
export class Order {
  @Prop({ type: Types.ObjectId, required: true })
  school_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, required: true })
  trustee_id: Types.ObjectId;

  @Prop({
    type: {
      name: { type: String, required: true },
      id: { type: String, required: true },
      email: { type: String, required: true },
    },
    required: true,
    _id: false,
  })
  student_info: {
    name: string;
    id: string;
    email: string;
  };

  @Prop({ required: true })
  gateway_name: string;

  @Prop({ required: true, unique: true })
  custom_order_id: string;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop()
  updated_at: Date;

  @Prop({ type: Object })
  metadata: Record<string, any>;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

// Add indexes for better performance
OrderSchema.index({ school_id: 1 });
OrderSchema.index({ custom_order_id: 1 });
OrderSchema.index({ created_at: -1 });