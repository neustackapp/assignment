const request = require('supertest');
const mongoose = require('mongoose');

jest.setTimeout(20000);

const app = require('../app');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');

const mongoUri = 'mongodb://127.0.0.1:27017/checkout-service-test';

beforeAll(async () => {
  await mongoose.connect(mongoUri);
});

afterAll(async () => {
  await mongoose.disconnect();
});

beforeEach(async () => {
  await Promise.all([
    Cart.deleteMany({}),
    Order.deleteMany({}),
    Product.deleteMany({}),
    Coupon.deleteMany({}),
  ]);
});

describe('coupon flow', () => {
  test('generates a coupon at the milestone and applies it during checkout', async () => {
    const product = await Product.create({ name: 'Notebook', price: 1000, stock: 50 });

    for (let i = 0; i < 5; i += 1) {
      const cart = await Cart.create({ items: [{ product: product._id, quantity: 1 }] });
      await Order.create({
        cart: cart._id,
        items: [
          {
            product: product._id,
            name: product.name,
            unitPrice: product.price,
            quantity: 1,
            lineTotal: product.price,
          },
        ],
        subtotal: product.price,
        discount: 0,
        total: product.price,
        couponCode: null,
      });
    }

    const generateResponse = await request(app).post('/admin/coupons/generate').expect(201);

    expect(generateResponse.body).toMatchObject({
      milestone: 5,
      discountPercent: 10,
      status: 'available',
    });
    expect(generateResponse.body.code).toMatch(/^SAVE/);

    const cartResponse = await request(app).post('/carts').expect(201);
    const cartId = cartResponse.body.id;

    await request(app)
      .post(`/carts/${cartId}/items`)
      .send({ productId: product._id.toString(), quantity: 1 })
      .expect(201);

    const checkoutResponse = await request(app)
      .post(`/carts/${cartId}/checkout`)
      .send({ couponCode: generateResponse.body.code })
      .expect(201);

    expect(checkoutResponse.body.couponCode).toBe(generateResponse.body.code);
    expect(checkoutResponse.body.discount).toBe(100);
    expect(checkoutResponse.body.total).toBe(900);

    const coupon = await Coupon.findOne({ code: generateResponse.body.code });
    expect(coupon.status).toBe('redeemed');
  });

  test('rejects a missing coupon and a redeemed coupon', async () => {
    const product = await Product.create({ name: 'Pen', price: 250, stock: 20 });

    const invalidResponse = await request(app)
      .post('/carts')
      .then(async (cartRes) => {
        const cartId = cartRes.body.id;
        await request(app)
          .post(`/carts/${cartId}/items`)
          .send({ productId: product._id.toString(), quantity: 1 });

        return request(app)
          .post(`/carts/${cartId}/checkout`)
          .send({ couponCode: 'SAVEINVALID' });
      });

    expect(invalidResponse.status).toBe(404);
    expect(invalidResponse.body.error.code).toBe('COUPON_NOT_FOUND');

    const redeemedCoupon = await Coupon.create({
      code: 'SAVEALREADY',
      milestone: 10,
      discountPercent: 10,
      status: 'redeemed',
      redeemedByOrder: new mongoose.Types.ObjectId(),
    });

    const secondCart = await request(app).post('/carts').expect(201);
    const secondCartId = secondCart.body.id;

    await request(app)
      .post(`/carts/${secondCartId}/items`)
      .send({ productId: product._id.toString(), quantity: 1 })
      .expect(201);

    const redeemedResponse = await request(app)
      .post(`/carts/${secondCartId}/checkout`)
      .send({ couponCode: redeemedCoupon.code })
      .expect(409);

    expect(redeemedResponse.body.error.code).toBe('COUPON_ALREADY_REDEEMED');
  });
});
