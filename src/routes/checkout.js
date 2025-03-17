const express = require("express");
const router = express.Router();
const items = require("../../data/products.js");
const { purchase } = require("../controllers/checkout.js");
const { addOrders, getAllOrders } = require("../../data/orders.js");

/**
 * @swagger
 * /checkout:
 *   post:
 *     summary: Purchase items.
 *     description: Purchase items with the provided data.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               discountCode:
 *                type: string
 *               cartData:
 *                 type: array
 *                 minItems: 1  // Ensures at least one item in the cartData array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     quantity:
 *                       type: number
 *             required:
 *               - email
 *               - cartData
 *     responses:
 *       '201':
 *         description: Purchase successful.
 *       '400':
 *         description: Bad request. Invalid data provided.
 */

router.post("/", (req, res) => {
  try {
    const { email, cartData, discountCode } = req.body;
    console.log("puchase items");
    // TODO: Check if email and cartData is valid
    if (!email || !cartData || !cartData.length) return res.json({ message: "Email and cart are required" });
    if (typeof email !== "string") return res.json({ message: "Email must be a string" });
    if (typeof cartData !== "object") return res.json({ message: "Cart must be an object" });
    // getting orders placed till now
    let ordersPlaced = getAllOrders();
    let order = {};
    //! Checking if discount code is valid, need to compare with discount codes available in DB taking 10OFF for now
    if (discountCode === "10OFF" && ordersPlaced.length % 2 === 1) {
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
