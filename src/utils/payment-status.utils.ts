// src/utils/payment-status.utils.ts
export type PaymentStatus = 'success' | 'pending' | 'failed' | 'cancelled';

/**
 * UNIFIED status mapper used by both PaymentsService and WebhooksService
 * No capture_status downgrade logic to prevent simulator SUCCESS -> pending issues
 */
export function mapGatewayStatus(gatewayStatus: string, _captureStatus?: string): PaymentStatus {
  if (!gatewayStatus) return 'pending';
  
  const normalized = gatewayStatus.toUpperCase();
  
  switch (normalized) {
    case 'SUCCESS':
    case 'COMPLETED':
    case 'PAID':
      return 'success';
    case 'FAILED':
    case 'DECLINED':
    case 'ERROR':
      return 'failed';
    case 'USER_DROPPED':
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    default:
      return 'pending';
  }
}

/**
 * Prevents final status downgrades (success/failed/cancelled -> pending)
 * Allows pending -> final upgrades
 */
export function shouldUpdateStatus(existing: PaymentStatus, incoming: PaymentStatus): boolean {
  if (!existing) return true;
  if (existing === 'success' || existing === 'failed' || existing === 'cancelled') {
    // final states, don’t downgrade
    return false;
  }
  return true; // allow pending → final
}


/**
 * Consistent payment_mode extraction with proper fallbacks
 */
export function extractPaymentMode(data: any, fallback?: any): string {
  return (
    data?.payment_mode ||
    data?.data?.payment_mode ||
    data?.payment_method ||
    data?.data?.payment_method ||
    fallback?.payment_mode ||
    fallback?.payment_method ||
    'unknown'
  );
}