const express = require('express');
const cartController = require('../controllers/cartController');

const router = express.Router();

router.post('/', cartController.createCart);
router.get('/:cartId', cartController.getCart);
router.post('/:cartId/items', cartController.addItem);
router.patch('/:cartId/items/:productId', cartController.updateItemQuantity);
router.delete('/:cartId/items/:productId', cartController.removeItem);

module.exports = router;
