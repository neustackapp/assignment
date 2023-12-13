const express = require('express');
require('dotenv').config();
const productRoute = require('./routes/product');
const cartRoute = require('./routes/cart');

const app = express();
const router = express.Router();

console.log(process.env.PORT);

let port = process.env.PORT || 5000;
// middleware to parse body
app.use(express.json());

// Get products
app.use('/products', productRoute);
// cart routes
app.use('/cart', require('./routes/cart'));

// creating a dummy route
app.get('/', (req, res) => {
    res.send('Hello World');
})

// Creating a node server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
})