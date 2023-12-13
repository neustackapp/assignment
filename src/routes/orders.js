const express = require("express");
const router = express.Router();
const {getAllOrders} = require('../../data/orders')

/*
    POST /orders/all
    Purpose: Get all orders in DB
    Params: null
*/
router.get('/all', (req, res)=>{
    let orders = getAllOrders();
    res.send(orders).status(200)
})


module.exports = router;