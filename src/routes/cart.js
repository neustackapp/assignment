const express = require('express');
const router = express.Router();
const items = require("../../data/products.js");
const { purchase } = require('../controllers/cart.js');
const ordersPlaced  = require('../../data/orders.js');
const fs = require('fs');

/*
    POST /cart
    Purpose: Purchase Items 
    Params: {email, cartData: [{id: 1, quantity: 2}, {id: 2, quantity: 3}]}
*/
router.post('/', (req,res)=>{
    try {
      const {email, cartData} = req.body;
      // TODO: Check if email and cartData is valid
      if (!email || !cartData) return res.json({ message: "Email and cart are required" });
        const order = purchase(email, cartData);
        ordersPlaced.push(order);
        res.json({ message: "Purchase Successful", data: order});  
    } catch (error) {
        console.log(error);
    }

})


module.exports = router;