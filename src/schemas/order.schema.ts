import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class StudentInfo {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  id: string;

  @Prop({ required: true })
  email: string;

  @Prop()
  phone?: string;

  @Prop()
  class?: string;

  @Prop()
  section?: string;
}
export const StudentInfoSchema = SchemaFactory.createForClass(StudentInfo);

@Schema({ timestamps: true })
export class Order {
  @Prop({ type: Types.ObjectId, required: true })
  school_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId })
  trustee_id: Types.ObjectId;

  @Prop({ required: true })
  amount: number;

  @Prop({ required: true, type: StudentInfoSchema })
  student_info: StudentInfo;

  @Prop()
  fee_type?: string;

  @Prop()
  description?: string;

  @Prop()
  gateway_name?: string;

  @Prop()
  return_url?: string;

  // ✅ Arbitrary metadata (providerResponse, collectRequestId, etc.)
  @Prop({ type: Object, default: {} })
  metadata?: Record<string, any>;

  @Prop({ required: true, unique: true })
  custom_order_id: string;
}

export type OrderDocument = Order & Document & {
  createdAt: Date;
  updatedAt: Date;
};

export const OrderSchema = SchemaFactory.createForClass(Order);
OrderSchema.index({ custom_order_id: 1 });
OrderSchema.index({ school_id: 1 });
