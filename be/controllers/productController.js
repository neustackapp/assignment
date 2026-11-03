const Product = require('../models/Product');

const getProducts = async (req, res, next) => {
  try {
    const products = await Product.find({}).sort({ createdAt: 1 }).lean();
    res.json(products);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProducts,
};
