const mongoose = require('mongoose');

const couponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    milestone: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Milestone must be an integer',
      },
    },
    discountPercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      validate: {
        validator: Number.isInteger,
        message: 'Discount percent must be an integer',
      },
    },
    status: {
      type: String,
      enum: ['available', 'redeemed'],
      default: 'available',
    },
    redeemedByOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Coupon', couponSchema);
