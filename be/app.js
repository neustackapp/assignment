const express = require('express');
const productRoutes = require('./routes/productRoutes');
const cartRoutes = require('./routes/cartRoutes');
const checkoutRoutes = require('./routes/checkoutRoutes');
const AppError = require('./utils/AppError');

const app = express();

app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/products', productRoutes);
app.use('/carts', cartRoutes);
app.use('/', checkoutRoutes);

app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  if (err?.name === 'CastError' || /Cast to ObjectId failed|invalid id/i.test(err?.message || '')) {
    return res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: 'Invalid id',
      },
    });
  }

  if (err?.code === 'ORDER_NOT_FOUND' || err?.code === 'CART_NOT_FOUND') {
    return res.status(err.statusCode || 404).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  console.error(err);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
});

module.exports = app;
