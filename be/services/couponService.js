const crypto = require('crypto');

const { couponEveryN, couponPercent } = require('../config');
const Coupon = require('../models/Coupon');
const Order = require('../models/Order');
const AppError = require('../utils/AppError');

function generateReadableCode() {
  return `SAVE${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

async function generateCoupon() {
  const orderCount = await Order.countDocuments();
  const reachedMilestones = Math.floor(orderCount / couponEveryN);

  if (reachedMilestones === 0) {
    throw new AppError(409, 'NO_COUPON_ELIGIBLE', 'No coupon eligible yet');
  }

  let milestoneToCreate = null;

  for (let k = 1; k <= reachedMilestones; k += 1) {
    const milestone = k * couponEveryN;
    const existingCoupon = await Coupon.findOne({ milestone }).lean();

    if (!existingCoupon) {
      milestoneToCreate = milestone;
      break;
    }
  }

  if (!milestoneToCreate) {
    throw new AppError(409, 'NO_COUPON_ELIGIBLE', 'No coupon eligible yet');
  }

  const code = generateReadableCode();

  try {
    const coupon = await Coupon.create({
      code,
      milestone: milestoneToCreate,
      discountPercent: couponPercent,
      status: 'available',
      redeemedByOrder: null,
    });

    return coupon;
  } catch (error) {
    if (error.code === 11000) {
      throw new AppError(409, 'COUPON_ALREADY_GENERATED', 'Coupon already generated');
    }

    throw error;
  }
}

module.exports = {
  generateCoupon,
};
