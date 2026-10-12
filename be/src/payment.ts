// Payment abstraction. The real world has a slow, fallible network call between
// "we decided to sell this" and "we recorded the sale"; the fake keeps that seam
// (it is async and can fail) so the checkout saga is exercised honestly.
import type { PaymentGateway } from './types.js';

type ChargeReq = { reference: string; amountCents: number };

export class FakePaymentGateway implements PaymentGateway {
  readonly charges: ChargeReq[] = [];
  private readonly delayMs: number;
  private readonly shouldFail: (req: ChargeReq) => boolean | Promise<boolean>;

  constructor({ delayMs = 0, shouldFail = () => false }: { delayMs?: number; shouldFail?: (req: ChargeReq) => boolean | Promise<boolean> } = {}) {
    this.delayMs = delayMs;
    this.shouldFail = shouldFail;
  }

  async charge({ reference, amountCents }: ChargeReq): Promise<{ id: string }> {
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    if (await this.shouldFail({ reference, amountCents })) {
      throw Object.assign(new Error('payment declined'), { code: 'PAYMENT_DECLINED' });
    }
    this.charges.push({ reference, amountCents });
    return { id: `pay_${reference}` };
  }
}
