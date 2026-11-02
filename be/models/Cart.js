const mongoose = require('mongoose');

const cartItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer',
      },
    },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    items: [cartItemSchema],
    status: {
      type: String,
      enum: ['open', 'checked_out'],
      default: 'open',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cart', cartSchema);
