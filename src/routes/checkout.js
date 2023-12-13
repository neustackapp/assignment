const express = require("express");
const router = express.Router();
const items = require("../../data/products.js");
const { purchase } = require("../controllers/checkout.js");
const { addOrders, getAllOrders } = require("../../data/orders.js");

/*
    POST /cart
    Purpose: Purchase Items 
    Params: {email, cartData: [{id: 1, quantity: 2}, {id: 2, quantity: 3}], discountCode: "10OFF"}
*/
router.post("/", (req, res) => {
  try {
    const { email, cartData, discountCode } = req.body;
    console.log("puchase items");
    // TODO: Check if email and cartData is valid
    if (!email || !cartData) return res.json({ message: "Email and cart are required" });
    if (typeof email !== "string") return res.json({ message: "Email must be a string" });
    if (typeof cartData !== "object") return res.json({ message: "Cart must be an object" });
    // getting orders placed till now
    let ordersPlaced = getAllOrders();
    let order = {};
    //! Checking if discount code is valid, need to compare with discount codes available in DB taking 10OFF for now
    if (discountCode === '10OFF' && ordersPlaced.length % 2 === 1) {
      // every 2nd order will be getting discount, Fixing n=2 for now
      order = purchase(email, cartData, 10, discountCode);
    } else {
      order = purchase(email, cartData);
    }
    addOrders(order);
    res.json({ message: "Purchase Successful", data: order });
  } catch (error) {
    console.log(error);
  }
});

module.exports = router;
