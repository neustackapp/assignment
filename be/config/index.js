require('dotenv').config();

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const config = {
  PORT: Number(process.env.PORT) || 3000,
  MONGO_URI: process.env.MONGO_URI || 'mongodb://localhost:27017/checkout-service',
  couponEveryN: parsePositiveInteger(process.env.COUPON_EVERY_N, 5),
  couponPercent: parsePositiveInteger(process.env.COUPON_PERCENT, 10),
};

module.exports = config;
