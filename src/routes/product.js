const express = require('express');
const router = express.Router();
const items = require("../../data/products.js");

// create a dummy router with product id as a parameter

router.get('/', (req, res) => {
    res.json(items).status(200);
})

module.exports = router;