import type { AddressInfo } from 'node:net';
import { createServer, createShop } from '../src/app.js';
import { FakePaymentGateway } from '../src/payment.js';
import type { PaymentGateway, Product } from '../src/types.js';

export async function start({ n = 3, x = 10, payment, products }: { n?: number; x?: number; payment?: FakePaymentGateway; products?: Product[] } = {}) {
  const gateway = payment ?? new FakePaymentGateway({ delayMs: 5 }); // delay forces real interleaving
  const shop = createShop({ config: { milestoneN: n, couponPercent: x }, payment: gateway as PaymentGateway, products });
  const server = createServer(shop);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const call = async (method: string, path: string, body?: unknown): Promise<{ status: number; headers: Headers; body: any }> => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  const cartWith = async (productId: string, quantity: number): Promise<string> => {
    const { body: cart } = await call('POST', '/carts');
    const added = await call('POST', `/carts/${cart.id}/items`, { productId, quantity });
    if (added.status !== 201) throw new Error(`setup failed: ${JSON.stringify(added.body)}`);
    return cart.id;
  };
  return { shop, gateway, call, cartWith, close: () => { server.close(); shop.close(); } };
}
