const cartService = require('../services/cartService');

async function createCart(req, res, next) {
  try {
    const cart = await cartService.createCart();
    res.status(201).json(cart);
  } catch (error) {
    next(error);
  }
}

async function getCart(req, res, next) {
  try {
    const cart = await cartService.getCart(req.params.cartId);
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

async function addItem(req, res, next) {
  try {
    const { productId, quantity } = req.body ?? {};
    const cart = await cartService.addItemToCart(req.params.cartId, productId, quantity);
    res.status(201).json(cart);
  } catch (error) {
    next(error);
  }
}

async function updateItemQuantity(req, res, next) {
  try {
    const { quantity } = req.body ?? {};
    const cart = await cartService.updateCartItemQuantity(req.params.cartId, req.params.productId, quantity);
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

async function removeItem(req, res, next) {
  try {
    const cart = await cartService.removeCartItem(req.params.cartId, req.params.productId);
    res.json(cart);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCart,
  getCart,
  addItem,
  updateItemQuantity,
  removeItem,
};
