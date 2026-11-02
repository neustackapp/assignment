const checkoutService = require('../services/checkoutService');
const Order = require('../models/Order');

async function checkoutCart(req, res, next) {
  try {
    const result = await checkoutService.checkout(req.params.cartId);

    if (result.replay) {
      return res.status(200).json(result.order);
    }

    return res.status(201).json(result.order);
  } catch (error) {
    return next(error);
  }
}

async function getOrder(req, res, next) {
  try {
    const order = await Order.findById(req.params.orderId).lean();

    if (!order) {
      return next({ statusCode: 404, code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    }

    return res.json({
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
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  checkoutCart,
  getOrder,
};
