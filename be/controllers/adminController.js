const couponService = require('../services/couponService');

async function generateCoupon(req, res, next) {
  try {
    const coupon = await couponService.generateCoupon();

    return res.status(201).json({
      id: coupon._id.toString(),
      code: coupon.code,
      milestone: coupon.milestone,
      discountPercent: coupon.discountPercent,
      status: coupon.status,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  generateCoupon,
};
