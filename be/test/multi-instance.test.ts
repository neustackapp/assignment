// Real isolation test: several separate OS processes (each its own app instance and its own
// SQLite connection) share one database file. Nothing in-process can serialize them, so the
// outcomes below hold only if the SQL transactions / conditional updates / constraints work.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

interface Instance { url: string; proc: ChildProcess; call(method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> }

async function startInstance(dbPath: string, port: number, env: Record<string, string> = {}): Promise<Instance> {
  const proc = spawn(process.execPath, [join(import.meta.dirname, '..', 'src', 'server.js')], {
    env: { ...process.env, DB_PATH: dbPath, PORT: String(port), PAYMENT_DELAY_MS: '40', CART_RACE_DELAY_MS: '20', ...env },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    proc.once('error', reject);
    proc.once('exit', (c) => reject(new Error(`instance exited early (${c})`)));
    proc.stdout!.on('data', (d) => { if (String(d).includes('Checkout service')) resolve(); });
  });
  const url = `http://127.0.0.1:${port}`;
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(url + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { url, proc, call };
}

async function withCluster(env: Record<string, string>, fn: (a: Instance, b: Instance, c: Instance) => Promise<void>) {
  const dir = mkdtempSync(join(tmpdir(), 'shop-'));
  const db = join(dir, 'shop.db');
  const base = 20000 + Math.floor(Math.random() * 20000);
  const a = await startInstance(db, base, env); // seeds the products first
  const b = await startInstance(db, base + 1, env);
  const c = await startInstance(db, base + 2, env);
  try { await fn(a, b, c); } finally {
    for (const i of [a, b, c]) { i.proc.removeAllListeners('exit'); i.proc.kill(); }
    rmSync(dir, { recursive: true, force: true });
  }
}

const cartWith = async (i: Instance, productId: string, quantity: number) => {
  const cart = (await i.call('POST', '/carts')).body;
  const r = await i.call('POST', `/carts/${cart.id}/items`, { productId, quantity });
  assert.equal(r.status, 201);
  return cart.id as string;
};

test('3 processes racing for 3 sneakers: exactly 3 orders, stock never negative', async () => {
  await withCluster({}, async (a, b, c) => {
    const nodes = [a, b, c];
    const carts = await Promise.all(Array.from({ length: 12 }, (_, k) => cartWith(nodes[k % 3]!, 'sneaker', 1)));
    const results = await Promise.all(carts.map((id, k) => nodes[(k + 1) % 3]!.call('POST', `/carts/${id}/checkout`, {})));
    assert.equal(results.filter((r) => r.status === 201).length, 3);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.status === 409 && r.body.error.code === 'INSUFFICIENT_STOCK'),
      JSON.stringify(results.filter((r) => r.status !== 201 && r.status !== 409)));
    const sneaker = (await a.call('GET', '/products')).body.products.find((p: any) => p.id === 'sneaker');
    assert.equal(sneaker.inventory, 0);
    assert.equal((await b.call('GET', '/admin/report')).body.totalOrders, 3);
  });
});

test('one coupon raced by checkouts on different processes is redeemed exactly once', async () => {
  await withCluster({ ORDER_MILESTONE_N: '1' }, async (a, b, c) => {
    await a.call('POST', `/carts/${await cartWith(a, 'widget', 1)}/checkout`, {});
    const coupon = (await a.call('POST', '/admin/coupons')).body;
    const carts = await Promise.all([cartWith(a, 'gizmo', 1), cartWith(b, 'gizmo', 1), cartWith(c, 'gizmo', 1)]);
    const results = await Promise.all([a, b, c].map((n, k) => n.call('POST', `/carts/${carts[k]}/checkout`, { couponCode: coupon.code })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'COUPON_UNAVAILABLE'));
    const report = (await c.call('GET', '/admin/report')).body;
    assert.deepEqual(report.coupons, { generated: 1, available: 0, reserved: 0, redeemed: 1 });
    assert.equal(report.totalDiscountsCents, 100);
    const gizmo = (await a.call('GET', '/products')).body.products.find((p: any) => p.id === 'gizmo');
    assert.equal(gizmo.inventory, 199, 'only the winner consumed stock; losers rolled back');
  });
});

test('the same cart checked out through 3 processes at once yields one order and one stock deduction', async () => {
  await withCluster({}, async (a, b, c) => {
    const cart = await cartWith(a, 'widget', 2);
    const results = await Promise.all([a, b, c, a, b, c].map((n) => n.call('POST', `/carts/${cart}/checkout`, {})));
    assert.equal(results.filter((r) => r.status === 201).length, 1, 'exactly one real creation');
    // The others either replayed the order or were told the checkout is still running.
    for (const r of results.filter((r) => r.status !== 201)) {
      assert.ok(r.status === 200 || (r.status === 409 && r.body.error.code === 'CHECKOUT_IN_PROGRESS'), JSON.stringify(r));
    }
    const final = await b.call('POST', `/carts/${cart}/checkout`, {}); // client retries after the dust settles
    assert.equal(final.status, 200);
    assert.equal(final.body.id, results.find((r) => r.status === 201)!.body.id);
    assert.equal((await c.call('GET', '/admin/report')).body.totalOrders, 1);
    const widget = (await a.call('GET', '/products')).body.products.find((p: any) => p.id === 'widget');
    assert.equal(widget.inventory, 98);
  });
});

test('admin double-click on coupon generation across processes creates one coupon per milestone', async () => {
  await withCluster({ ORDER_MILESTONE_N: '2' }, async (a, b, c) => {
    for (let k = 0; k < 2; k++) await a.call('POST', `/carts/${await cartWith(a, 'gizmo', 1)}/checkout`, {});
    const results = await Promise.all([a, b, c, a, b, c].map((n) => n.call('POST', '/admin/coupons')));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.ok(results.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'NO_ELIGIBLE_MILESTONE'));
    assert.equal((await b.call('GET', '/admin/report')).body.coupons.generated, 1);
  });
});

test('many carts, each submitted to 3 processes at the same instant: no double order, no 5xx', async () => {
  await withCluster({}, async (a, b, c) => {
    const carts = await Promise.all(Array.from({ length: 30 }, () => cartWith(a, 'thingamajig', 1)));
    const all = await Promise.all(carts.flatMap((id) => [a, b, c].map((n) => n.call('POST', `/carts/${id}/checkout`, {}))));
    const bad = all.filter((r) => ![200, 201].includes(r.status) && !(r.status === 409 && r.body.error.code === 'CHECKOUT_IN_PROGRESS'));
    assert.deepEqual(bad, [], 'unexpected responses');
    assert.equal(all.filter((r) => r.status === 201).length, 30, 'each cart created exactly one order');
    assert.equal((await a.call('GET', '/admin/report')).body.totalOrders, 30);
    const p = (await b.call('GET', '/products')).body.products.find((x: any) => x.id === 'thingamajig');
    assert.equal(p.inventory, 970, 'stock deducted once per cart');
  });
});
