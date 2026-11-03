const mongoose = require('mongoose');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const AppError = require('../utils/AppError');

function isValidPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function buildCartView(cart) {
  const items = await Promise.all(
    cart.items.map(async (item) => {
      const product = await Product.findById(item.product).lean();

      if (!product) {
        return {
          productId: item.product.toString(),
          name: 'Unknown product',
          unitPrice: 0,
          quantity: item.quantity,
          lineTotal: 0,
        };
      }

      const lineTotal = product.price * item.quantity;

      return {
        productId: product._id.toString(),
        name: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal,
      };
    })
  );

  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);

  return {
    id: cart._id.toString(),
    status: cart.status,
    items,
    total,
  };
}

async function createCart() {
  const cart = await Cart.create({ items: [] });
  return buildCartView(cart);
}

async function getCart(cartId) {
  if (!isValidObjectId(cartId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid cart id');
  }

  const cart = await Cart.findById(cartId);
  if (!cart) {
    throw new AppError(404, 'CART_NOT_FOUND', 'Cart not found');
  }

  return buildCartView(cart);
}

async function addItemToCart(cartId, productId, quantity) {
  if (!isValidObjectId(cartId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid cart id');
  }

  if (!isValidObjectId(productId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid product id');
  }

  if (!isValidPositiveInteger(quantity)) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }

  const cart = await Cart.findById(cartId);
  if (!cart) {
    throw new AppError(404, 'CART_NOT_FOUND', 'Cart not found');
  }

  if (cart.status !== 'open') {
    throw new AppError(409, 'CART_NOT_OPEN', 'Cart is not open');
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  }

  const existingItem = cart.items.find((item) => item.product.toString() === productId);
  const nextQuantity = existingItem ? existingItem.quantity + quantity : quantity;

  if (nextQuantity > product.stock) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock available');
  }

  if (existingItem) {
    existingItem.quantity = nextQuantity;
  } else {
    cart.items.push({ product: product._id, quantity });
  }

  await cart.save();
  return buildCartView(cart);
}

async function updateCartItemQuantity(cartId, productId, quantity) {
  if (!isValidObjectId(cartId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid cart id');
  }

  if (!isValidObjectId(productId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid product id');
  }

  if (!isValidPositiveInteger(quantity)) {
    throw new AppError(400, 'INVALID_QUANTITY', 'Quantity must be a positive integer');
  }

  const cart = await Cart.findById(cartId);
  if (!cart) {
    throw new AppError(404, 'CART_NOT_FOUND', 'Cart not found');
  }

  if (cart.status !== 'open') {
    throw new AppError(409, 'CART_NOT_OPEN', 'Cart is not open');
  }

  const item = cart.items.find((entry) => entry.product.toString() === productId);
  if (!item) {
    throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found in cart');
  }

  const product = await Product.findById(productId);
  if (!product) {
    throw new AppError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
  }

  if (quantity > product.stock) {
    throw new AppError(409, 'INSUFFICIENT_STOCK', 'Not enough stock available');
  }

  item.quantity = quantity;
  await cart.save();
  return buildCartView(cart);
}

async function removeCartItem(cartId, productId) {
  if (!isValidObjectId(cartId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid cart id');
  }

  if (!isValidObjectId(productId)) {
    throw new AppError(400, 'INVALID_ID', 'Invalid product id');
  }

  const cart = await Cart.findById(cartId);
  if (!cart) {
    throw new AppError(404, 'CART_NOT_FOUND', 'Cart not found');
  }

  if (cart.status !== 'open') {
    throw new AppError(409, 'CART_NOT_OPEN', 'Cart is not open');
  }

  const itemIndex = cart.items.findIndex((item) => item.product.toString() === productId);
  if (itemIndex === -1) {
    throw new AppError(404, 'ITEM_NOT_FOUND', 'Item not found in cart');
  }

  cart.items.splice(itemIndex, 1);
  await cart.save();
  return buildCartView(cart);
}

module.exports = {
  createCart,
  getCart,
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
};
