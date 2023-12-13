const express = require('express');
const router = express.Router();
const items = require("../../data/products.js");

// create a dummy router with product id as a parameter

router.get('/', (req, res) => {
    console.log("getting here")
    console.log(items);
    res.json(items);
})

module.exports = router;