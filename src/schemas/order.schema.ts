// src/schemas/order.schema.ts
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
  school_id: string;

  @Prop({ type: Types.ObjectId })
  trustee_id: string;

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

  @Prop({ type: Object })
  metadata?: Record<string, any>;

  @Prop()
  custom_order_id?: string;
}

// 👇 add timestamps in the type
export type OrderDocument = Order &
  Document & {
    createdAt: Date;
    updatedAt: Date;
  };

export const OrderSchema = SchemaFactory.createForClass(Order);
