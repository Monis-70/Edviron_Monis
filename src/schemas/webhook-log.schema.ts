import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebhookLogDocument = WebhookLog & Document;

@Schema({ timestamps: true, collection: 'webhook_logs' })
export class WebhookLog {
  @Prop({ required: true })
  webhook_id: string; // unique webhook identifier

  @Prop({ required: true })
  event_type: string; // e.g. payment_update, refund, etc.

  @Prop({ type: Object, required: true })
  payload: Record<string, any>; // raw payload

  @Prop({ type: Object })
  headers: Record<string, any>;

  @Prop({
    required: true,
    enum: ['pending', 'processing', 'processed', 'failed', 'retrying'],
    default: 'pending',
  })
  status: string;

  @Prop()
  processed_at?: Date;

  @Prop()
  error_message?: string;

  @Prop({ default: 0 })
  retry_count: number;

  @Prop()
  next_retry_at?: Date;

  @Prop()
  ip_address?: string;

  @Prop()
  user_agent?: string;

  @Prop({ type: Object })
  response?: Record<string, any>;

  @Prop()
  processing_time_ms?: number;

  // ✅ Links
  @Prop({ type: Types.ObjectId, ref: 'Order' })
  related_order_id?: Types.ObjectId;

  @Prop()
  provider_collect_id?: string;

  @Prop()
  custom_order_id?: string;

  @Prop()
  gateway_status?: string;

  @Prop()
  normalized_status?: string;
}

export const WebhookLogSchema = SchemaFactory.createForClass(WebhookLog);

// ✅ Indexes
WebhookLogSchema.index({ webhook_id: 1 });
WebhookLogSchema.index({ status: 1 });
WebhookLogSchema.index({ createdAt: -1 });
WebhookLogSchema.index({ event_type: 1 });
WebhookLogSchema.index({ related_order_id: 1 });
WebhookLogSchema.index({ provider_collect_id: 1 });
WebhookLogSchema.index({ custom_order_id: 1 });
