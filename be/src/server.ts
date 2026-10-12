import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createServer, createShop } from './app.js';
import { loadConfig } from './config.js';
import { FakePaymentGateway } from './payment.js';

const config = loadConfig();
if (config.dbPath && config.dbPath !== ':memory:') mkdirSync(dirname(config.dbPath), { recursive: true });
// PAYMENT_DELAY_MS widens the window between reserve and commit; used by the multi-instance tests.
const payment = new FakePaymentGateway({ delayMs: Number(process.env.PAYMENT_DELAY_MS ?? 0) });
const raceMs = Number(process.env.CART_RACE_DELAY_MS ?? 0); // test seam, see Shop.afterCartRead
const afterCartRead = raceMs ? () => new Promise<void>((r) => setTimeout(r, raceMs)) : undefined;
const server = createServer(createShop({ config, payment, afterCartRead }));
server.listen(config.port, () => {
  console.log(`Checkout service on :${config.port} db=${config.dbPath} (every ${config.milestoneN} orders -> ${config.couponPercent}% coupon)`);
});
