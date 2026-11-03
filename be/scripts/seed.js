const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Product = require('../models/Product');

const seedProducts = [
  { name: 'Classic Cotton T-Shirt', price: 2499, stock: 12 },
  { name: 'Leather Laptop Sleeve', price: 3999, stock: 8 },
  { name: 'Ceramic Coffee Mug', price: 799, stock: 20 },
  { name: 'Wireless Noise Cancelling Headphones', price: 14999, stock: 5 },
  { name: 'Minimalist Desk Lamp', price: 3499, stock: 3 },
  { name: 'Travel Water Bottle', price: 1299, stock: 15 },
];

async function seed() {
  try {
    await connectDB();
    await Product.deleteMany({});

    const products = await Product.insertMany(seedProducts);

    console.log('Inserted products:');
    products.forEach((product) => {
      console.log(`${product._id}: ${product.name} | price: ${product.price} paise | stock: ${product.stock}`);
    });

    console.log(`Inserted ${products.length} products`);
  } catch (error) {
    console.error('Seeding failed:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

seed();
