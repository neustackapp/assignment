const couponService = require('../services/couponService');
const reportService = require('../services/reportService');

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

async function getReport(req, res, next) {
  try {
    const report = await reportService.getReport();
    return res.status(200).json(report);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  generateCoupon,
  getReport,
};
