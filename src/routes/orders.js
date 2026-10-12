const express = require("express");
const router = express.Router();
const { getAllOrders } = require("../../data/orders");

/**
 * @swagger
 * /orders/all:
 *   get:
 *     summary: Get all orders
 *     description: Get all orders
 *     responses:
 *       '200':
 *         description: A successful response
 */
router.get("/all", (req, res) => {
  let orders = getAllOrders();
  res.send({ orders: orders }).status(200);
});

module.exports = router;
