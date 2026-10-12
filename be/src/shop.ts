import { randomBytes, randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { ApiError, badRequest, conflict, notFound, unprocessable } from './errors.js';
import { percentDiscountCents } from './money.js';
import { openDb } from './db.js';
import type { CartStatus, Config, Coupon, CouponStatus, Order, OrderLine, PaymentGateway, Product } from './types.js';

const MAX_QTY_PER_LINE = 100;

/**
 * SQLite-backed domain core.
 *
 * CONCURRENCY MODEL: correctness never depends on "only one request runs at a time". Each
 * invariant is enforced by the database, so it also holds with several app instances
 * sharing one database file (see test/multi-instance.test.ts):
 *   - every multi-statement step runs in a BEGIN IMMEDIATE transaction (takes the write lock);
 *   - every state change is a conditional UPDATE whose `changes` count is checked
 *     (`inventory >= ?`, `status = 'AVAILABLE'`, `status = 'OPEN'`);
 *   - UNIQUE / CHECK constraints (see db.ts) reject anything the code gets wrong.
 *
 * Checkout is a saga of two transactions around the (slow, fallible) payment call:
 *   TX1 reserve : cart OPEN->CHECKING_OUT, stock decrement, coupon AVAILABLE->RESERVED
 *   await payment
 *   TX2 commit  : insert order, coupon RESERVED->REDEEMED, cart CHECKING_OUT->CHECKED_OUT
 *   (payment failed -> compensating tx: restore stock, coupon -> AVAILABLE, cart -> OPEN)
 */

// Thrown inside TX1 when another request changed the cart between our read and our update.
class CartStateChanged extends Error {}

type Row = Record<string, any>;

interface Reservation {
  lines: OrderLine[];
  coupon: { code: string; percent: number } | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
}

export class Shop {
  private readonly db: DatabaseSync;
  /** Same-process duplicates join the running attempt; other instances get 409 CHECKOUT_IN_PROGRESS. */
  private readonly inflight = new Map<string, Promise<Order>>();

  constructor(
    readonly config: Config,
    private readonly payment: PaymentGateway,
    products: Product[],
    /** Test seam: awaited between reading the cart and TX1, to widen the race window across processes. */
    private readonly afterCartRead: () => Promise<void> = async () => {},
  ) {
    this.db = openDb(config.dbPath ?? ':memory:');
    this.tx(() => {
      for (const p of products) {
        this.run('INSERT OR IGNORE INTO products (id, name, price_cents, inventory) VALUES (?, ?, ?, ?)',
          p.id, p.name, p.priceCents, p.inventory);
      }
    });
  }

  close(): void { this.db.close(); }

  // ---------- db helpers ----------
  private tx<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
  private get(sql: string, ...p: SQLInputValue[]): Row | undefined { return this.db.prepare(sql).get(...p) as Row | undefined; }
  private all(sql: string, ...p: SQLInputValue[]): Row[] { return this.db.prepare(sql).all(...p) as Row[]; }
  /** Returns the number of rows changed: the heart of every conditional update. */
  private run(sql: string, ...p: SQLInputValue[]): number { return Number(this.db.prepare(sql).run(...p).changes); }

  // ---------- products ----------
  private static product(r: Row): Product {
    return { id: r.id, name: r.name, priceCents: r.price_cents, inventory: r.inventory };
  }

  listProducts(): Product[] {
    return this.all('SELECT * FROM products ORDER BY rowid').map(Shop.product);
  }

  getProduct(id: string): Product {
    const r = this.get('SELECT * FROM products WHERE id = ?', id);
    if (!r) throw notFound('PRODUCT_NOT_FOUND', `Product '${id}' does not exist`);
    return Shop.product(r);
  }

  /** Admin: change price and/or inventory. */
  updateProduct(id: string, body: { priceCents?: number; inventory?: number } | undefined): Product {
    const { priceCents, inventory } = body ?? {};
    if (priceCents === undefined && inventory === undefined) {
      throw badRequest('VALIDATION_ERROR', 'Provide priceCents and/or inventory');
    }
    if (priceCents !== undefined && (!Number.isSafeInteger(priceCents) || priceCents < 0)) {
      throw badRequest('VALIDATION_ERROR', 'priceCents must be a non-negative integer');
    }
    if (inventory !== undefined && (!Number.isSafeInteger(inventory) || inventory < 0)) {
      throw badRequest('VALIDATION_ERROR', 'inventory must be a non-negative integer');
    }
    this.getProduct(id);
    this.run('UPDATE products SET price_cents = COALESCE(?, price_cents), inventory = COALESCE(?, inventory) WHERE id = ?',
      priceCents ?? null, inventory ?? null, id);
    return this.getProduct(id);
  }

  // ---------- carts ----------
  createCart() {
    const id = randomUUID();
    this.run("INSERT INTO carts (id, status, created_at) VALUES (?, 'OPEN', ?)", id, now());
    return this.viewCart(id);
  }

  private cartRow(id: string): Row {
    const r = this.get('SELECT * FROM carts WHERE id = ?', id);
    if (!r) throw notFound('CART_NOT_FOUND', `Cart '${id}' does not exist`);
    return r;
  }

  viewCart(cartId: string) {
    const cart = this.cartRow(cartId);
    const rows = this.all(
      `SELECT ci.product_id, ci.quantity, ci.price_when_added_cents, p.name, p.price_cents, p.inventory
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ? ORDER BY ci.rowid`, cartId);
    let subtotal = 0;
    const items = rows.map((r) => {
      const lineTotalCents = r.price_cents * r.quantity;
      subtotal += lineTotalCents;
      return {
        productId: r.product_id,
        name: r.name,
        quantity: r.quantity,
        unitPriceCents: r.price_cents, // current price: what checkout would charge
        lineTotalCents,
        priceWhenAddedCents: r.price_when_added_cents,
        priceChanged: r.price_cents !== r.price_when_added_cents,
        inStock: r.inventory >= r.quantity,
        available: r.inventory,
      };
    });
    return {
      id: cart.id as string,
      status: cart.status as CartStatus,
      currency: 'USD',
      items,
      subtotalCents: subtotal,
      orderId: (cart.order_id as string | null) ?? null,
    };
  }

  static validateQuantity(q: unknown): asserts q is number {
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 1 || q > MAX_QTY_PER_LINE) {
      throw badRequest('INVALID_QUANTITY', `quantity must be an integer between 1 and ${MAX_QTY_PER_LINE}`);
    }
  }

  /** Adding an already-present product increases its quantity. */
  addItem(cartId: string, body: { productId?: unknown; quantity?: unknown } | undefined) {
    const { productId, quantity } = body ?? {};
    if (typeof productId !== 'string' || !productId) throw badRequest('VALIDATION_ERROR', 'productId is required');
    Shop.validateQuantity(quantity);
    return this.tx(() => {
      this.assertOpen(cartId);
      const product = this.getProduct(productId);
      const existing = this.get('SELECT quantity FROM cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId);
      const newQty = (existing?.quantity ?? 0) + quantity;
      this.checkLineQuantity(product, newQty);
      this.run(
        `INSERT INTO cart_items (cart_id, product_id, quantity, price_when_added_cents) VALUES (?, ?, ?, ?)
         ON CONFLICT (cart_id, product_id) DO UPDATE SET quantity = excluded.quantity, price_when_added_cents = excluded.price_when_added_cents`,
        cartId, productId, newQty, product.priceCents);
      return this.viewCart(cartId);
    });
  }

  setItemQuantity(cartId: string, productId: string, body: { quantity?: unknown } | undefined) {
    const { quantity } = body ?? {};
    return this.tx(() => {
      this.assertOpen(cartId);
      if (!this.get('SELECT 1 FROM cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId)) {
        throw notFound('ITEM_NOT_IN_CART', `Product '${productId}' is not in the cart`);
      }
      Shop.validateQuantity(quantity);
      const product = this.getProduct(productId);
      this.checkLineQuantity(product, quantity);
      this.run('UPDATE cart_items SET quantity = ?, price_when_added_cents = ? WHERE cart_id = ? AND product_id = ?',
        quantity, product.priceCents, cartId, productId);
      return this.viewCart(cartId);
    });
  }

  removeItem(cartId: string, productId: string) {
    return this.tx(() => {
      this.assertOpen(cartId);
      if (this.run('DELETE FROM cart_items WHERE cart_id = ? AND product_id = ?', cartId, productId) === 0) {
        throw notFound('ITEM_NOT_IN_CART', `Product '${productId}' is not in the cart`);
      }
      return this.viewCart(cartId);
    });
  }

  private assertOpen(cartId: string): void {
    const status = this.cartRow(cartId).status as CartStatus;
    if (status !== 'OPEN') {
      throw conflict('CART_NOT_OPEN', `Cart is ${status} and can no longer be modified`, { status });
    }
  }

  // Early, advisory stock check at cart time (stock is NOT reserved by carts).
  private checkLineQuantity(product: Product, qty: number): void {
    if (qty > MAX_QTY_PER_LINE) throw badRequest('INVALID_QUANTITY', `at most ${MAX_QTY_PER_LINE} per line`);
    if (qty > product.inventory) {
      throw conflict('INSUFFICIENT_STOCK', `Only ${product.inventory} of '${product.id}' available`, {
        productId: product.id, requested: qty, available: product.inventory,
      });
    }
  }

  // ---------- checkout ----------
  /**
   * Idempotency: the cart is the natural idempotency key (one cart -> at most one order).
   *  - cart OPEN             -> run checkout
   *  - cart CHECKING_OUT     -> same process: join the running attempt; another instance: 409 CHECKOUT_IN_PROGRESS
   *  - cart CHECKED_OUT      -> replay the stored order, no side effects
   * A retry that changes the coupon is a different request and is rejected.
   * Two instances racing on an OPEN cart are separated by the conditional UPDATE in TX1.
   */
  async checkout(
    cartId: string,
    body: { couponCode?: unknown; acceptPriceChanges?: unknown } | undefined,
  ): Promise<{ order: Order; replayed: boolean }> {
    const couponCode = normalizeCode(body?.couponCode);
    const acceptPriceChanges = body?.acceptPriceChanges === true;

    for (let attempt = 0; attempt < 5; attempt++) {
      const cart = this.cartRow(cartId);
      const status = cart.status as CartStatus;
      if (status === 'OPEN') await this.afterCartRead(); // the read above may be stale by now: TX1's conditional UPDATE decides

      if (status !== 'OPEN') {
        if (((cart.checkout_coupon as string | null) ?? undefined) !== couponCode) {
          throw conflict('CHECKOUT_PARAMS_MISMATCH',
            'This cart already has a checkout with a different coupon', { couponCode: cart.checkout_coupon ?? undefined });
        }
        if (status === 'CHECKED_OUT') return { order: this.getOrder(cart.order_id), replayed: true };
        const running = this.inflight.get(cartId);
        if (running) return { order: await running, replayed: true };
        throw conflict('CHECKOUT_IN_PROGRESS', 'A checkout for this cart is in progress; retry shortly', { retryAfterSeconds: 1 });
      }

      let reserved: Reservation;
      try {
        reserved = this.tx(() => this.reserve(cartId, couponCode, acceptPriceChanges));
      } catch (err) {
        if (err instanceof CartStateChanged) continue; // lost a race: re-read state and take the replay/in-progress path
        throw err;
      }
      const attemptPromise = this.payAndCommit(cartId, reserved);
      this.inflight.set(cartId, attemptPromise);
      attemptPromise.then(() => this.inflight.delete(cartId), () => this.inflight.delete(cartId));
      return { order: await attemptPromise, replayed: false };
    }
    throw conflict('CHECKOUT_IN_PROGRESS', 'Cart is being modified concurrently; retry shortly');
  }

  /** TX1. Any throw rolls the whole transaction back, so a rejected checkout leaves no trace. */
  private reserve(cartId: string, couponCode: string | undefined, acceptPriceChanges: boolean): Reservation {
    // Compare-and-set: only one caller, in any process, can move OPEN -> CHECKING_OUT.
    if (this.run("UPDATE carts SET status = 'CHECKING_OUT', checkout_coupon = ? WHERE id = ? AND status = 'OPEN'",
      couponCode ?? null, cartId) === 0) {
      throw new CartStateChanged();
    }

    const items = this.all(
      `SELECT ci.product_id, ci.quantity, ci.price_when_added_cents, p.name, p.price_cents, p.inventory
         FROM cart_items ci JOIN products p ON p.id = ci.product_id
        WHERE ci.cart_id = ? ORDER BY ci.rowid`, cartId);
    if (items.length === 0) throw unprocessable('EMPTY_CART', 'Cannot check out an empty cart');

    const lines: OrderLine[] = [];
    const priceChanges: unknown[] = [];
    const shortages: unknown[] = [];
    for (const r of items) {
      if (r.inventory < r.quantity) shortages.push({ productId: r.product_id, requested: r.quantity, available: r.inventory });
      if (r.price_cents !== r.price_when_added_cents) {
        priceChanges.push({ productId: r.product_id, priceWhenAddedCents: r.price_when_added_cents, currentPriceCents: r.price_cents });
      }
      lines.push({
        productId: r.product_id, name: r.name, quantity: r.quantity,
        unitPriceCents: r.price_cents, lineTotalCents: r.price_cents * r.quantity,
      });
    }
    if (shortages.length) throw conflict('INSUFFICIENT_STOCK', 'Some items are no longer available in the requested quantity', { items: shortages });
    if (priceChanges.length && !acceptPriceChanges) {
      throw conflict('PRICE_CHANGED', 'Prices changed since items were added; review the cart and retry with acceptPriceChanges=true', { items: priceChanges });
    }

    let coupon: { code: string; percent: number } | null = null;
    if (couponCode) {
      const c = this.get('SELECT code, percent, status FROM coupons WHERE code = ?', couponCode);
      if (!c) throw unprocessable('COUPON_INVALID', `Coupon '${couponCode}' does not exist`);
      // Compare-and-set: exactly one checkout can move AVAILABLE -> RESERVED.
      if (this.run("UPDATE coupons SET status = 'RESERVED' WHERE code = ? AND status = 'AVAILABLE'", couponCode) === 0) {
        const current = this.get('SELECT status FROM coupons WHERE code = ?', couponCode);
        throw conflict('COUPON_UNAVAILABLE', `Coupon is ${current?.status}`, { status: current?.status });
      }
      coupon = { code: c.code, percent: c.percent };
    }

    const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
    const discountCents = coupon ? percentDiscountCents(subtotalCents, coupon.percent) : 0;
    const totalCents = subtotalCents - discountCents;

    // Conditional decrement: the WHERE clause is the oversell guard (the CHECK constraint is the backstop).
    for (const l of lines) {
      if (this.run('UPDATE products SET inventory = inventory - ? WHERE id = ? AND inventory >= ?',
        l.quantity, l.productId, l.quantity) === 0) {
        const p = this.getProduct(l.productId);
        throw conflict('INSUFFICIENT_STOCK', 'Some items are no longer available in the requested quantity',
          { items: [{ productId: l.productId, requested: l.quantity, available: p.inventory }] });
      }
    }
    return { lines, coupon, subtotalCents, discountCents, totalCents };
  }

  private async payAndCommit(cartId: string, r: Reservation): Promise<Order> {
    let payment: { id: string };
    try {
      payment = await this.payment.charge({ reference: cartId, amountCents: r.totalCents });
    } catch (err) {
      this.tx(() => this.release(cartId, r));
      throw new ApiError(402, 'PAYMENT_FAILED', 'Payment was not successful; nothing was reserved or charged',
        { reason: (err as { code?: string }).code ?? 'ERROR' });
    }
    try {
      return this.tx(() => this.commit(cartId, r, payment.id));
    } catch (err) {
      // Money was taken but we could not record the order. A real system issues a refund here (deferred).
      this.tx(() => this.release(cartId, r));
      throw err;
    }
  }

  /** TX2. Each transition is conditional on the state TX1 left behind. */
  private commit(cartId: string, r: Reservation, paymentId: string): Order {
    const id = randomUUID();
    const sequence = Number(this.get('SELECT COALESCE(MAX(sequence), 0) + 1 AS n FROM orders')!.n); // UNIQUE backs this up
    this.run(
      `INSERT INTO orders (id, sequence, cart_id, subtotal_cents, coupon_code, coupon_percent, discount_cents, total_cents, payment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, sequence, cartId, r.subtotalCents, r.coupon?.code ?? null, r.coupon?.percent ?? null,
      r.discountCents, r.totalCents, paymentId, now());
    for (const l of r.lines) {
      this.run('INSERT INTO order_lines (order_id, product_id, name, quantity, unit_price_cents, line_total_cents) VALUES (?, ?, ?, ?, ?, ?)',
        id, l.productId, l.name, l.quantity, l.unitPriceCents, l.lineTotalCents);
    }
    if (r.coupon && this.run("UPDATE coupons SET status = 'REDEEMED', redeemed_by_order_id = ? WHERE code = ? AND status = 'RESERVED'", id, r.coupon.code) !== 1) {
      throw new Error('invariant violated: reserved coupon was not in RESERVED state');
    }
    if (this.run("UPDATE carts SET status = 'CHECKED_OUT', order_id = ? WHERE id = ? AND status = 'CHECKING_OUT'", id, cartId) !== 1) {
      throw new Error('invariant violated: cart was not CHECKING_OUT');
    }
    return this.getOrder(id);
  }

  /** Compensating transaction: give back everything TX1 took. */
  private release(cartId: string, r: Reservation): void {
    for (const l of r.lines) this.run('UPDATE products SET inventory = inventory + ? WHERE id = ?', l.quantity, l.productId);
    if (r.coupon) this.run("UPDATE coupons SET status = 'AVAILABLE' WHERE code = ? AND status = 'RESERVED'", r.coupon.code);
    this.run("UPDATE carts SET status = 'OPEN', checkout_coupon = NULL WHERE id = ? AND status = 'CHECKING_OUT'", cartId);
  }

  getOrder(id: string): Order {
    const o = this.get('SELECT * FROM orders WHERE id = ?', id);
    if (!o) throw notFound('ORDER_NOT_FOUND', `Order '${id}' does not exist`);
    const lines = this.all('SELECT * FROM order_lines WHERE order_id = ? ORDER BY rowid', id).map((l): OrderLine => ({
      productId: l.product_id, name: l.name, quantity: l.quantity,
      unitPriceCents: l.unit_price_cents, lineTotalCents: l.line_total_cents,
    }));
    return {
      id: o.id,
      sequence: o.sequence,
      cartId: o.cart_id,
      currency: 'USD',
      lines,
      subtotalCents: o.subtotal_cents,
      coupon: o.coupon_code ? { code: o.coupon_code, percent: o.coupon_percent } : null,
      discountCents: o.discount_cents,
      totalCents: o.total_cents,
      paymentId: o.payment_id,
      createdAt: o.created_at,
    };
  }

  // ---------- admin: coupons & reporting ----------
  /**
   * Milestone k is reached once k*n orders exist. Each milestone yields exactly one coupon:
   * the lowest reached milestone without one. Runs in one IMMEDIATE transaction and the
   * UNIQUE(milestone) constraint means even two instances cannot both create it.
   */
  generateCoupon(): Coupon {
    const { milestoneN: n, couponPercent: x } = this.config;
    return this.tx(() => {
      const orders = Number(this.get('SELECT COUNT(*) AS n FROM orders')!.n);
      const reached = Math.floor(orders / n);
      const done = new Set(this.all('SELECT milestone FROM coupons').map((r) => r.milestone as number));
      let milestone: number | null = null;
      for (let k = 1; k <= reached; k++) if (!done.has(k)) { milestone = k; break; }
      if (milestone === null) {
        throw conflict('NO_ELIGIBLE_MILESTONE', 'No unrewarded order milestone has been reached', {
          ordersPlaced: orders,
          nextMilestoneAtOrder: (reached + 1) * n,
        });
      }
      const coupon: Coupon = {
        code: `SAVE${x}-${randomBytes(4).toString('hex').toUpperCase()}`,
        percent: x,
        milestone,
        status: 'AVAILABLE',
        createdAt: now(),
      };
      this.run("INSERT INTO coupons (code, percent, milestone, status, created_at) VALUES (?, ?, ?, 'AVAILABLE', ?)",
        coupon.code, coupon.percent, coupon.milestone, coupon.createdAt);
      return coupon;
    });
  }

  listCoupons(): Coupon[] {
    return this.all('SELECT * FROM coupons ORDER BY milestone').map((c) => ({
      code: c.code, percent: c.percent, milestone: c.milestone, status: c.status as CouponStatus,
      createdAt: c.created_at, ...(c.redeemed_by_order_id ? { redeemedByOrderId: c.redeemed_by_order_id } : {}),
    }));
  }

  /** Pure reads inside one (deferred) transaction, so all figures come from the same snapshot. */
  report() {
    this.db.exec('BEGIN');
    try {
      const totals = this.get(
        `SELECT COUNT(*) AS orders, COALESCE(SUM(subtotal_cents),0) AS gross,
                COALESCE(SUM(discount_cents),0) AS discounts, COALESCE(SUM(total_cents),0) AS net FROM orders`)!;
      const byProduct = this.all('SELECT product_id, SUM(quantity) AS q FROM order_lines GROUP BY product_id ORDER BY MIN(rowid)');
      const counts: Record<CouponStatus, number> = { AVAILABLE: 0, RESERVED: 0, REDEEMED: 0 };
      for (const r of this.all('SELECT status, COUNT(*) AS n FROM coupons GROUP BY status')) counts[r.status as CouponStatus] = r.n;
      return {
        currency: 'USD',
        totalOrders: totals.orders as number,
        purchasedQuantityByProduct: Object.fromEntries(byProduct.map((r) => [r.product_id, r.q as number])),
        grossRevenueCents: totals.gross as number,
        totalDiscountsCents: totals.discounts as number,
        netRevenueCents: totals.net as number,
        coupons: {
          generated: counts.AVAILABLE + counts.RESERVED + counts.REDEEMED,
          available: counts.AVAILABLE,
          reserved: counts.RESERVED, // held by an in-flight checkout; generated = available + reserved + redeemed
          redeemed: counts.REDEEMED,
        },
      };
    } finally {
      this.db.exec('COMMIT');
    }
  }
}

const now = () => new Date().toISOString();
const normalizeCode = (c: unknown): string | undefined => (typeof c === 'string' && c.trim() ? c.trim().toUpperCase() : undefined);
