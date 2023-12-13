const express = require("express");
const { getAllOrders } = require("../../data/orders");
const { getPurchaseSummary } = require("../controllers/admin");
const router = express.Router();

/**
 * @swagger
 * /admin/discountCode:
 *   get:
 *     summary: Generate discount code for every second order
 *     description: Generate discount code for every second order
 *     responses:
 *       '200':
 *         description: Successful response.
 *       '404':
 *         description: Resource not found.
 */
router.get("/discountCode", (req, res) => {
  try {
    let ordersPlaced = getAllOrders();
    if (ordersPlaced.length % 2 === 1) {
      res.status(200).json({ discountCode: "10OFF" });
    } else {
      res.status(200).json({ message: `No discount available for ${ordersPlaced.length + 1} order` });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
});

/**
 * @swagger
 * /admin/purchaseSummary:
 *   get:
 *     summary: Get purchase summary of all orders placed till now
 *     description: Retrieve information from the server for totalAmount, totalDiscount, purchasedItems, discountCodes.
 *     responses:
 *       '200':
 *         description: Successful response.
 *       '404':
 *         description: Resource not found.
 */
router.get("/purchaseSummary", (req, res) => {
  try {
    let summaryDetails = getPurchaseSummary();
    res.status(200).send(summaryDetails);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: err.message });
  }
});
module.exports = router;
