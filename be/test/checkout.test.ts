import { test } from 'node:test';
import assert from 'node:assert/strict';
import { start } from './helpers.js';
import { FakePaymentGateway } from '../src/payment.js';
import { percentDiscountCents } from '../src/money.js';

test('concurrent checkouts never oversell limited inventory', async () => {
  const s = await start();
  try {
    // 'sneaker' has 3 units. 10 customers each want 1.
    const carts = await Promise.all(Array.from({ length: 10 }, () => s.cartWith('sneaker', 1)));
    const results = await Promise.all(carts.map((id) => s.call('POST', `/carts/${id}/checkout`, {})));
    const ok = results.filter((r) => r.status === 201);
    const rejected = results.filter((r) => r.status === 409);
    assert.equal(ok.length, 3);
    assert.equal(rejected.length, 7);
    assert.ok(rejected.every((r) => r.body.error.code === 'INSUFFICIENT_STOCK'));
    assert.equal(s.shop.getProduct('sneaker').inventory, 0);
    assert.equal(s.gateway.charges.length, 3);
  } finally { s.close(); }
});

test('retried and simultaneous checkouts of one cart create one order and deduct stock once', async () => {
  const s = await start();
  try {
    const cart = await s.cartWith('widget', 2);
    const before = s.shop.getProduct('widget').inventory;
    const results = await Promise.all(Array.from({ length: 5 }, () => s.call('POST', `/carts/${cart}/checkout`, {})));
    const late = await s.call('POST', `/carts/${cart}/checkout`, {}); // retry after completion
    const all = [...results, late];
    assert.ok(all.every((r) => r.status === 200 || r.status === 201));
    assert.equal(new Set(all.map((r) => r.body.id)).size, 1, 'every response is the same order');
    assert.equal(all.filter((r) => r.status === 201).length, 1, 'exactly one real creation');
    assert.equal(late.headers.get('idempotent-replayed'), 'true');
    assert.equal(s.shop.getProduct('widget').inventory, before - 2);
    assert.equal((await s.call('GET', '/admin/report')).body.totalOrders, 1);
    assert.equal(s.gateway.charges.length, 1);
  } finally { s.close(); }
});

test('a coupon cannot be redeemed by two concurrent checkouts', async () => {
  const s = await start({ n: 1, x: 10 });
  try {
    await s.call('POST', `/carts/${await s.cartWith('widget', 1)}/checkout`, {});
    const { body: coupon } = await s.call('POST', '/admin/coupons');
    const a = await s.cartWith('gadget', 1);
    const b = await s.cartWith('gizmo', 1);
    const [ra, rb] = await Promise.all([
      s.call('POST', `/carts/${a}/checkout`, { couponCode: coupon.code }),
      s.call('POST', `/carts/${b}/checkout`, { couponCode: coupon.code }),
    ]);
    assert.deepEqual([ra.status, rb.status].sort(), [201, 409]);
    const loser = ra.status === 409 ? ra : rb;
    assert.equal(loser.body.error.code, 'COUPON_UNAVAILABLE');
    // The loser's stock must have been untouched.
    const loserProduct = ra.status === 409 ? 'gadget' : 'gizmo';
    assert.equal(s.shop.getProduct(loserProduct).inventory, loserProduct === 'gadget' ? 50 : 200);
    assert.equal((await s.call('GET', '/admin/report')).body.coupons.redeemed, 1);
  } finally { s.close(); }
});

test('failed payment releases stock and the coupon, and the cart can be retried', async () => {
  let fail = true;
  const s = await start({ n: 1, payment: new FakePaymentGateway({ shouldFail: () => fail }) });
  try {
    fail = false;
    await s.call('POST', `/carts/${await s.cartWith('widget', 1)}/checkout`, {});
    const { body: coupon } = await s.call('POST', '/admin/coupons');
    const cart = await s.cartWith('gadget', 2);
    fail = true;
    const bad = await s.call('POST', `/carts/${cart}/checkout`, { couponCode: coupon.code });
    assert.equal(bad.status, 402);
    assert.equal(bad.body.error.code, 'PAYMENT_FAILED');
    assert.equal(s.shop.getProduct('gadget').inventory, 50, 'stock restored');
    assert.equal(s.shop.listCoupons().find((c) => c.code === coupon.code)?.status, 'AVAILABLE', 'coupon not lost');
    assert.equal((await s.call('GET', '/admin/report')).body.totalOrders, 1, 'no order recorded');
    fail = false;
    const good = await s.call('POST', `/carts/${cart}/checkout`, { couponCode: coupon.code });
    assert.equal(good.status, 201);
    assert.equal(good.body.discountCents, 990); // 10% of 9900
  } finally { s.close(); }
});

test('coupon is generated once per milestone, only when reached', async () => {
  const s = await start({ n: 2, x: 10 });
  try {
    const gen = () => s.call('POST', '/admin/coupons');
    const place = async () => s.call('POST', `/carts/${await s.cartWith('gizmo', 1)}/checkout`, {});
    assert.equal((await gen()).body.error.code, 'NO_ELIGIBLE_MILESTONE');
    await place();
    assert.equal((await gen()).status, 409, 'order 1 of 2 is not a milestone');
    await place();
    const results = await Promise.all([gen(), gen(), gen()]); // admin double-click
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    await place(); await place(); // orders 3, 4 -> second milestone
    assert.equal((await gen()).status, 201);
    assert.equal((await gen()).status, 409);
    assert.equal((await s.call('GET', '/admin/report')).body.coupons.generated, 2);
  } finally { s.close(); }
});

test('price change after add requires acknowledgement; order snapshots what was charged', async () => {
  const s = await start();
  try {
    const cart = await s.cartWith('widget', 2);
    await s.call('PATCH', '/admin/products/widget', { priceCents: 2500 });
    const view = await s.call('GET', `/carts/${cart}`);
    assert.equal(view.body.items[0].priceChanged, true);
    assert.equal(view.body.subtotalCents, 5000);
    const blocked = await s.call('POST', `/carts/${cart}/checkout`, {});
    assert.equal(blocked.body.error.code, 'PRICE_CHANGED');
    assert.equal(s.shop.getProduct('widget').inventory, 100, 'nothing reserved on rejection');
    const ok = await s.call('POST', `/carts/${cart}/checkout`, { acceptPriceChanges: true });
    assert.equal(ok.status, 201);
    await s.call('PATCH', '/admin/products/widget', { priceCents: 1 });
    const order = await s.call('GET', `/orders/${ok.body.id}`);
    assert.equal(order.body.lines[0].unitPriceCents, 2500, 'order unaffected by later price change');
    assert.equal(order.body.totalCents, 5000);
  } finally { s.close(); }
});

test('report reconciles with orders and coupons and is read-only', async () => {
  const s = await start({ n: 2, x: 10 });
  try {
    const orders = [];
    for (const [pid, q] of [['widget', 1], ['gadget', 2]] as [string, number][]) {
      orders.push((await s.call('POST', `/carts/${await s.cartWith(pid, q)}/checkout`, {})).body);
    }
    const { body: coupon } = await s.call('POST', '/admin/coupons');
    orders.push((await s.call('POST', `/carts/${await s.cartWith('doohickey', 1)}/checkout`, { couponCode: coupon.code })).body);
    const r1 = (await s.call('GET', '/admin/report')).body;
    const r2 = (await s.call('GET', '/admin/report')).body;
    assert.deepEqual(r1, r2);
    assert.equal(r1.totalOrders, 3);
    assert.equal(r1.grossRevenueCents, orders.reduce((t, o) => t + o.subtotalCents, 0));
    assert.equal(r1.totalDiscountsCents, 1250);
    assert.equal(r1.netRevenueCents, r1.grossRevenueCents - r1.totalDiscountsCents);
    assert.equal(r1.netRevenueCents, orders.reduce((t, o) => t + o.totalCents, 0));
    assert.deepEqual(r1.purchasedQuantityByProduct, { widget: 1, gadget: 2, doohickey: 1 });
    assert.deepEqual(r1.coupons, { generated: 1, available: 0, reserved: 0, redeemed: 1 });
  } finally { s.close(); }
});

test('validation: bad quantities, unknown products, empty cart, closed cart', async () => {
  const s = await start();
  try {
    const { body: cart } = await s.call('POST', '/carts');
    const add = (b: unknown) => s.call('POST', `/carts/${cart.id}/items`, b);
    for (const quantity of [0, -1, 1.5, '2', null, 101]) {
      assert.equal((await add({ productId: 'widget', quantity })).body.error.code, 'INVALID_QUANTITY', String(quantity));
    }
    assert.equal((await add({ productId: 'nope', quantity: 1 })).status, 404);
    assert.equal((await add({ productId: 'sneaker', quantity: 4 })).body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal((await s.call('POST', `/carts/${cart.id}/checkout`, {})).body.error.code, 'EMPTY_CART');
    await add({ productId: 'widget', quantity: 1 });
    await s.call('POST', `/carts/${cart.id}/checkout`, {});
    assert.equal((await add({ productId: 'widget', quantity: 1 })).body.error.code, 'CART_NOT_OPEN');
    const other = await s.cartWith('gizmo', 1);
    assert.equal((await s.call('POST', `/carts/${other}/checkout`, { couponCode: 'FAKE' })).body.error.code, 'COUPON_INVALID');
  } finally { s.close(); }
});

test('discount math: integer half-up rounding, capped at subtotal', () => {
  assert.equal(percentDiscountCents(999, 10), 100); // 99.9 -> 100
  assert.equal(percentDiscountCents(995, 10), 100); // 99.5 -> 100 (half up)
  assert.equal(percentDiscountCents(994, 10), 99);
  assert.equal(percentDiscountCents(0, 10), 0);
  assert.equal(percentDiscountCents(500, 100), 500);
  assert.equal(percentDiscountCents(1, 100), 1);
});
