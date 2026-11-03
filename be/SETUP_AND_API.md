

---

# Setup, run and API reference

Design decisions, trade-offs and what was left out are in [DECISIONS.md](./DECISIONS.md).

## Setup and run

Requirements: Node.js 20+ and MongoDB 6+ running as a single-node replica set (checkout uses transactions, which MongoDB only supports on a replica set).

1. Start MongoDB as a replica set. With a local `mongod`:

   ```bash
   mkdir -p ~/mongo-data
   mongod --replSet rs0 --dbpath ~/mongo-data --bind_ip 127.0.0.1
   ```

   In another terminal, first time only:

   ```bash
   mongosh --eval 'rs.initiate({_id: "rs0", members: [{_id: 0, host: "127.0.0.1:27017"}]})'
   ```

   If MongoDB is installed as a service, add `replication: { replSetName: rs0 }` to `/etc/mongod.conf`, restart the service and run the `rs.initiate` command once.

2. Install and configure:

   ```bash
   cd be
   npm install
   cp .env.example .env
   ```

   | Variable | Default | Meaning |
   |---|---|---|
   | `PORT` | 3000 | HTTP port |
   | `MONGO_URI` | see `.env.example` | MongoDB connection string |
   | `COUPON_EVERY_N` | 5 | `n`: a coupon becomes available after every nth placed order |
   | `COUPON_PERCENT` | 10 | `x`: discount percentage of the coupon |

3. Seed products (6 products, one with only 3 units in stock) and start:

   ```bash
   npm run seed
   npm start
   ```

   Running the seed again deletes and recreates the products.

Automated tests are not included, see DECISIONS.md.

## API reference

All money values are integers in paise (1 rupee = 100 paise). Request and response bodies are JSON. Operations under `/admin` are the administrative ones; there is no authentication.

Every error has the same shape:

```json
{ "error": { "code": "INSUFFICIENT_STOCK", "message": "Not enough stock available" } }
```

### Products

| Method and path | Description | Success |
|---|---|---|
| `GET /products` | List products with `_id`, `name`, `price`, `stock` | 200 |

### Carts

A cart view looks like this:

```json
{
  "id": "…",
  "status": "open",
  "items": [
    { "productId": "…", "name": "Ceramic Coffee Mug", "unitPrice": 799, "quantity": 2, "lineTotal": 1598 }
  ],
  "total": 1598
}
```

Prices in a cart view are the products' current prices. The price that is charged is fixed at checkout.

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /carts` | none | 201, cart view | |
| `GET /carts/:cartId` | none | 200, cart view | 400 `INVALID_ID`, 404 `CART_NOT_FOUND` |
| `POST /carts/:cartId/items` | `{ "productId", "quantity" }` | 201, cart view. Adding a product already in the cart increases its quantity. | 400 `INVALID_ID`, 400 `INVALID_QUANTITY`, 404 `CART_NOT_FOUND`, 404 `PRODUCT_NOT_FOUND`, 409 `INSUFFICIENT_STOCK`, 409 `CART_NOT_OPEN` |
| `PATCH /carts/:cartId/items/:productId` | `{ "quantity" }` | 200, cart view | same as above, plus 404 `ITEM_NOT_FOUND` |
| `DELETE /carts/:cartId/items/:productId` | none | 200, cart view | 400 `INVALID_ID`, 404 `CART_NOT_FOUND`, 404 `ITEM_NOT_FOUND`, 409 `CART_NOT_OPEN` |

`quantity` must be a positive integer. A cart that has been checked out can no longer be changed (409 `CART_NOT_OPEN`).

### Checkout and orders

| Method and path | Body | Success | Errors |
|---|---|---|---|
| `POST /carts/:cartId/checkout` | optional `{ "couponCode": "SAVE…" }` | 201 with the order on the first successful call. 200 with the same order if the cart was already checked out (safe to retry). | 400 `INVALID_ID`, 400 `EMPTY_CART`, 404 `CART_NOT_FOUND`, 404 `COUPON_NOT_FOUND`, 404 `PRODUCT_NOT_FOUND`, 409 `INSUFFICIENT_STOCK`, 409 `COUPON_ALREADY_REDEEMED` |
| `GET /orders/:orderId` | none | 200 with the order | 400 `INVALID_ID`, 404 `ORDER_NOT_FOUND` |

A failed checkout changes nothing: stock is untouched, the cart stays open and the coupon stays available. On a retry of an already completed checkout, a `couponCode` in the body is ignored.

An order looks like this:

```json
{
  "id": "…",
  "cartId": "…",
  "items": [
    { "productId": "…", "name": "Ceramic Coffee Mug", "unitPrice": 799, "quantity": 2, "lineTotal": 1598 }
  ],
  "subtotal": 1598,
  "discount": 159,
  "total": 1439,
  "couponCode": "SAVE1A2B3C4D",
  "createdAt": "…"
}
```

`discount` is `floor(subtotal * percent / 100)` and `total = subtotal - discount`.

### Admin

| Method and path | Description | Success | Errors |
|---|---|---|---|
| `POST /admin/coupons/generate` | Creates one coupon for the oldest milestone (n, 2n, 3n…) that has been reached and has no coupon yet | 201 `{ id, code, milestone, discountPercent, status }` | 409 `NO_COUPON_ELIGIBLE`, 409 `COUPON_ALREADY_GENERATED` (two requests raced for the same milestone) |
| `GET /admin/report` | Read-only summary, does not change any data | 200 | |

Report response:

```json
{
  "totalOrders": 3,
  "grossRevenue": 5000,
  "totalDiscounts": 250,
  "netRevenue": 4750,
  "purchasedQuantityByProduct": [
    { "productId": "…", "name": "Ceramic Coffee Mug", "quantity": 4 }
  ],
  "coupons": { "generated": 1, "available": 0, "redeemed": 1 }
}
```

`grossRevenue` is the sum of order subtotals, `netRevenue` equals the sum of order totals, and `generated = available + redeemed`.

### Health

`GET /health` returns `200 { "status": "ok" }`.
