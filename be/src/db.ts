import { DatabaseSync } from 'node:sqlite';

// The schema is the last line of defence for the invariants: even if application code is
// wrong (or another instance races us), these constraints make the bad state unrepresentable.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  inventory   INTEGER NOT NULL CHECK (inventory >= 0)            -- never oversell
);
CREATE TABLE IF NOT EXISTS carts (
  id              TEXT PRIMARY KEY,
  status          TEXT NOT NULL CHECK (status IN ('OPEN','CHECKING_OUT','CHECKED_OUT')),
  checkout_coupon TEXT,
  order_id        TEXT,
  created_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_items (
  cart_id                TEXT NOT NULL REFERENCES carts(id),
  product_id             TEXT NOT NULL REFERENCES products(id),
  quantity               INTEGER NOT NULL CHECK (quantity > 0),
  price_when_added_cents INTEGER NOT NULL,
  PRIMARY KEY (cart_id, product_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  sequence       INTEGER NOT NULL UNIQUE,
  cart_id        TEXT NOT NULL UNIQUE REFERENCES carts(id),      -- one order per cart
  subtotal_cents INTEGER NOT NULL,
  coupon_code    TEXT,
  coupon_percent INTEGER,
  discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
  total_cents    INTEGER NOT NULL CHECK (total_cents >= 0),
  payment_id     TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  CHECK (total_cents = subtotal_cents - discount_cents)
);
CREATE TABLE IF NOT EXISTS order_lines (
  order_id         TEXT NOT NULL REFERENCES orders(id),
  product_id       TEXT NOT NULL,
  name             TEXT NOT NULL,
  quantity         INTEGER NOT NULL,
  unit_price_cents INTEGER NOT NULL,
  line_total_cents INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE TABLE IF NOT EXISTS coupons (
  code                 TEXT PRIMARY KEY,
  percent              INTEGER NOT NULL,
  milestone            INTEGER NOT NULL UNIQUE,                  -- one coupon per milestone
  status               TEXT NOT NULL CHECK (status IN ('AVAILABLE','RESERVED','REDEEMED')),
  created_at           TEXT NOT NULL,
  redeemed_by_order_id TEXT UNIQUE REFERENCES orders(id)         -- one redemption per order
);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 10000'); // writers from other processes wait instead of failing
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}
