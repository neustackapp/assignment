const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Coupon = require('../models/Coupon');
const AppError = require('../utils/AppError');

function serializeOrder(order) {
  return {
    id: order._id.toString(),
    cartId: order.cart.toString(),
    items: order.items.map((item) => ({
      productId: item.product.toString(),
      name: item.name,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: item.lineTotal,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    total: order.total,
    couponCode: order.couponCode,
    createdAt: order.createdAt,
  };
}

async function checkout(cartId, couponCode) {
  let result;
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const claimedCart = await Cart.findOneAndUpdate(
        { _id: cartId, status: 'open' },
        { status: 'checked_out' },
        { new: true, session }
      );

      if (!claimedCart) {
        const cartExists = await Cart.exists({ _id: cartId }).session(session);

        if (!cartExists) {
          throw new AppError(404, 'CART_NOT_FOUND', 'Cart not found');
        }

        const existingOrder = await Order.findOne({ cart: cartId }).session(session);
        if (existingOrder) {
          result = { replay: true, order: serializeOrder(existingOrder) };
          return;
        }

        const cart = await Cart.findById(cartId).session(session);
        if (cart && cart.status !== 'open') {
          throw new AppError(409, 'CART_NOT_OPEN', 'Cart is not open');
        }
      }

      if (!claimedCart) {
        return;
      }

      if (!claimedCart.items || claimedCart.items.length === 0) {
        throw new AppError(400, 'EMPTY_CART', 'Cart is empty');
      }

      const productIds = claimedCart.items.map((item) => item.product);
      const products = await Product.find({ _id: { $in: productIds } }).session(session);
      const productMap = new Map(products.map((product) => [product._id.toString(), product]));

      const itemSnapshots = claimedCart.items.map((item) => {
        const product = productMap.get(item.product.toString());
        if (!product) {
          throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product not found: ${item.product.toString()}`);
        }

        const unitPrice = product.price;
        const lineTotal = unitPrice * item.quantity;

        return {
          product: item.product,
          name: product.name,
          unitPrice,
          quantity: item.quantity,
          lineTotal,
        };
      });

      let subtotal = 0;
      for (const item of itemSnapshots) {
        subtotal += item.lineTotal;
      }

      let appliedCoupon = null;
      let orderId = null;

      if (couponCode) {
        // We lock the coupon and the new order to the same transaction so a later rollback clears both together.
        orderId = new mongoose.Types.ObjectId();
        const claimedCoupon = await Coupon.findOneAndUpdate(
          { code: couponCode, status: 'available' },
          { status: 'redeemed', redeemedByOrder: orderId },
          { new: true, session }
        );

        if (!claimedCoupon) {
          const couponExists = await Coupon.findOne({ code: couponCode }).session(session);

          if (!couponExists) {
            throw new AppError(404, 'COUPON_NOT_FOUND', 'Coupon not found');
          }

          throw new AppError(409, 'COUPON_ALREADY_REDEEMED', 'Coupon already redeemed');
        }

        appliedCoupon = claimedCoupon;
      }

      for (const item of claimedCart.items) {
        const product = productMap.get(item.product.toString());
        if (!product) {
          throw new AppError(404, 'PRODUCT_NOT_FOUND', `Product not found: ${item.product.toString()}`);
        }

        const update = await Product.updateOne(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session }
        );

        if (update.modifiedCount === 0) {
          throw new AppError(
            409,
            'INSUFFICIENT_STOCK',
            `Insufficient stock for ${product.name}`
          );
        }
      }

      let discount = 0;
      let total = subtotal;
      let finalCouponCode = null;

      if (appliedCoupon) {
        discount = Math.min(subtotal, Math.floor((subtotal * appliedCoupon.discountPercent) / 100));
        total = subtotal - discount;
        finalCouponCode = appliedCoupon.code;
      }

      const order = await Order.create(
        [
          {
            _id: orderId || new mongoose.Types.ObjectId(),
            cart: claimedCart._id,
            items: itemSnapshots,
            subtotal,
            discount,
            total,
            couponCode: finalCouponCode,
          },
        ],
        { session }
      );

      result = { replay: false, order: serializeOrder(order[0]) };
    });
  } finally {
    await session.endSession();
  }

  return result;
}

module.exports = {
  checkout,
  serializeOrder,
};
