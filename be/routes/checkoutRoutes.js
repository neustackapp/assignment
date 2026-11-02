const express = require('express');
const checkoutController = require('../controllers/checkoutController');

const router = express.Router();

router.post('/:cartId/checkout', checkoutController.checkoutCart);
router.get('/orders/:orderId', checkoutController.getOrder);

module.exports = router;
