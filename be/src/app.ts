import http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, badRequest, notFound } from './errors.js';
import { Shop } from './shop.js';
import { FakePaymentGateway } from './payment.js';
import { loadConfig } from './config.js';
import { seedProducts } from './seed.js';
import type { Config, PaymentGateway, Product } from './types.js';

interface Ctx { params: Record<string, string>; body: any }
interface Out { status: number; body: unknown; headers?: Record<string, string> }
interface Route { method: string; re: RegExp; handler: (ctx: Ctx) => Out | Promise<Out> }

export function createShop(opts: { config?: Config; payment?: PaymentGateway; products?: Product[]; afterCartRead?: () => Promise<void> } = {}): Shop {
  return new Shop(opts.config ?? loadConfig(), opts.payment ?? new FakePaymentGateway(), opts.products ?? seedProducts(), opts.afterCartRead);
}

// Admin operations live under /admin. Authn/authz is intentionally not implemented.
export function buildRoutes(shop: Shop): Route[] {
  const r: Route[] = [];
  const add = (method: string, path: string, handler: Route['handler']) =>
    r.push({ method, re: new RegExp('^' + path.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });

  add('GET', '/products', () => ({ status: 200, body: { products: shop.listProducts() } }));
  add('POST', '/carts', () => ({ status: 201, body: shop.createCart() }));
  add('GET', '/carts/:id', ({ params }) => ({ status: 200, body: shop.viewCart(params.id) }));
  add('POST', '/carts/:id/items', ({ params, body }) => ({ status: 201, body: shop.addItem(params.id, body) }));
  add('PUT', '/carts/:id/items/:productId', ({ params, body }) => ({ status: 200, body: shop.setItemQuantity(params.id, params.productId, body) }));
  add('DELETE', '/carts/:id/items/:productId', ({ params }) => ({ status: 200, body: shop.removeItem(params.id, params.productId) }));
  add('POST', '/carts/:id/checkout', async ({ params, body }) => {
    const { order, replayed } = await shop.checkout(params.id, body);
    return { status: replayed ? 200 : 201, body: order, headers: replayed ? { 'Idempotent-Replayed': 'true' } : undefined } satisfies Out;
  });
  add('GET', '/orders/:id', ({ params }) => ({ status: 200, body: shop.getOrder(params.id) }));

  add('POST', '/admin/coupons', () => ({ status: 201, body: shop.generateCoupon() }));
  add('GET', '/admin/coupons', () => ({ status: 200, body: { coupons: shop.listCoupons() } }));
  add('GET', '/admin/report', () => ({ status: 200, body: shop.report() }));
  add('PATCH', '/admin/products/:id', ({ params, body }) => ({ status: 200, body: shop.updateProduct(params.id, body) }));
  return r;
}

export function createServer(shop: Shop): http.Server {
  const routes = buildRoutes(shop);
  return http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/\/+$/, '') || '/';
      let matchedPath = false;
      for (const route of routes) {
        const m = route.re.exec(path);
        if (!m) continue;
        matchedPath = true;
        if (route.method !== req.method) continue;
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJson(req) : undefined;
        const out = await route.handler({ params: { ...m.groups } as Record<string, string>, body });
        return send(res, out.status, out.body, out.headers);
      }
      throw matchedPath
        ? new ApiError(405, 'METHOD_NOT_ALLOWED', `${req.method} not supported on ${path}`)
        : notFound('ROUTE_NOT_FOUND', `No route for ${req.method} ${path}`);
    } catch (err) {
      if (err instanceof ApiError) {
        return send(res, err.status, { error: { code: err.code, message: err.message, details: err.details } });
      }
      console.error(err);
      send(res, 500, { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } });
    }
  });
}

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw badRequest('BODY_TOO_LARGE', 'Request body too large');
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('INVALID_JSON', 'Request body is not valid JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers });
  res.end(data);
}
