const express = require('express');
const checkoutController = require('../controllers/checkoutController');

const router = express.Router();

router.post('/carts/:cartId/checkout', checkoutController.checkoutCart);
router.get('/orders/:orderId', checkoutController.getOrder);

module.exports = router;
