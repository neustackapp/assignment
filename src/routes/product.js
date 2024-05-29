const express = require("express");
const router = express.Router();
const items = require("../../data/products.js");

// create a dummy router with product id as a parameter

// generate swagger documentation for the route
/**
 * @swagger
 * /products:
 *  get:
 *    summary: Get all products in db
 *    description: Get all products in db
 *    responses:
 *      '200':
 *        description: A successful response
 */
router.get("/", (req, res) => {
  res.json(items).status(200);
});

module.exports = router;
