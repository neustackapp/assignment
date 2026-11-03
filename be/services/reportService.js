const Order = require('../models/Order');
const Coupon = require('../models/Coupon');

async function getReport() {
  const [orderSummary, couponSummary] = await Promise.all([
    Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          grossRevenue: { $sum: '$subtotal' },
          totalDiscounts: { $sum: '$discount' },
        },
      },
    ]),
    Coupon.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  const summary = orderSummary[0] || {
    totalOrders: 0,
    grossRevenue: 0,
    totalDiscounts: 0,
  };

  const purchasedQuantityByProduct = await Order.aggregate([
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        quantity: { $sum: '$items.quantity' },
      },
    },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: 1,
        quantity: 1,
      },
    },
    { $sort: { name: 1 } },
  ]);

  const couponCounts = {
    generated: 0,
    available: 0,
    redeemed: 0,
  };

  for (const item of couponSummary || []) {
    if (item._id === 'available') couponCounts.available = item.count;
    if (item._id === 'redeemed') couponCounts.redeemed = item.count;
  }

  couponCounts.generated = couponCounts.available + couponCounts.redeemed;

  return {
    totalOrders: summary.totalOrders,
    grossRevenue: summary.grossRevenue,
    totalDiscounts: summary.totalDiscounts,
    netRevenue: summary.grossRevenue - summary.totalDiscounts,
    purchasedQuantityByProduct,
    coupons: {
      generated: couponCounts.generated,
      available: couponCounts.available,
      redeemed: couponCounts.redeemed,
    },
  };
}

module.exports = {
  getReport,
};
