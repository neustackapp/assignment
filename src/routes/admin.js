const express = require("express");
const { getAllOrders } = require("../../data/orders");
const router = express.Router();

/*
    GET /discountCode
    Purpose: Get discount code
    Params: null
*/

router.get("/discountCode", (req, res) => {
  let ordersPlaced = getAllOrders();
  if (ordersPlaced.length % 2 === 1) {
    res.json({ discountCode: "10OFF" }).status(200);
  } else {
    res.json({ message: `No discount available for ${ordersPlaced.length + 1} order` }).status(200);
  }
});

/*
    GET /purchaseSummary
    Purpose: Get purchase summary
    Params: null
*/
router.get("/purchaseSummary", (req, res) => {
  let ordersPlaced = getAllOrders();

  let itemsPurchased = [],
    totalAmount = 0,
    discountCodes = [],
    totalDiscountAmount = 0;
  ordersPlaced.forEach((order, index) => {
    totalAmount += order.totalPrice;
    console.log("total price", order.totalPrice, totalAmount);
    itemsPurchased.push(
      ...order.product.flatMap((item) => {
        return { id: item.id };
      })
    );
    if (order.discount) {
      discountCodes.find((code) => code === order.discountCode) ? null : discountCodes.push(order.discountCode);
      totalDiscountAmount += (order.totalPrice * parseInt(order.discount.split("%")[0])) / 100;
      console.log(totalDiscountAmount);
    }
  });
  res.send({ totalAmount, totalDiscountAmount, discountCodes, itemsPurchased }).status(200);
});
module.exports = router;
