import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WebhookLogDocument = WebhookLog & Document;

@Schema({
  timestamps: true,
  collection: 'webhook_logs',
})
export class WebhookLog {
  @Prop({ required: true })
  webhook_id: string;

  @Prop({ required: true })
  event_type: string;

  @Prop({ type: Object, required: true })
  payload: Record<string, any>;

  @Prop({ type: Object })
  headers: Record<string, any>;

  @Prop({ 
    required: true,
    enum: ['pending', 'processed', 'failed', 'retrying'],
    default: 'pending'
  })
  status: string;

  @Prop()
  processed_at: Date;

  @Prop()
  error_message: string;

  @Prop({ default: 0 })
  retry_count: number;

  @Prop()
  next_retry_at: Date;

  @Prop()
  ip_address: string;

  @Prop()
  user_agent: string;

  @Prop({ type: Object })
  response: Record<string, any>;

  @Prop()
  processing_time_ms: number;

  @Prop({ type: Types.ObjectId, ref: 'Order' })
  related_order_id: Types.ObjectId;
}

export const WebhookLogSchema = SchemaFactory.createForClass(WebhookLog);

// Add indexes for efficient querying
WebhookLogSchema.index({ webhook_id: 1 });
WebhookLogSchema.index({ status: 1 });
WebhookLogSchema.index({ created_at: -1 });
WebhookLogSchema.index({ event_type: 1 });
WebhookLogSchema.index({ related_order_id: 1 });