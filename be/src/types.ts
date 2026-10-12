export interface Product { id: string; name: string; priceCents: number; inventory: number }
export interface Config { milestoneN: number; couponPercent: number; port?: number; dbPath?: string }
export type CartStatus = 'OPEN' | 'CHECKING_OUT' | 'CHECKED_OUT';
export interface OrderLine { productId: string; name: string; quantity: number; unitPriceCents: number; lineTotalCents: number }
export interface Order {
  id: string;
  sequence: number;
  cartId: string;
  currency: 'USD';
  lines: OrderLine[];
  subtotalCents: number;
  coupon: { code: string; percent: number } | null;
  discountCents: number;
  totalCents: number;
  paymentId: string;
  createdAt: string;
}
export type CouponStatus = 'AVAILABLE' | 'RESERVED' | 'REDEEMED';
export interface Coupon {
  code: string;
  percent: number;
  milestone: number;
  status: CouponStatus;
  createdAt: string;
  redeemedByOrderId?: string;
}
export interface PaymentGateway {
  charge(req: { reference: string; amountCents: number }): Promise<{ id: string }>;
}
