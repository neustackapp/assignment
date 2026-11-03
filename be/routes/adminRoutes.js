const express = require('express');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.post('/coupons/generate', adminController.generateCoupon);

module.exports = router;
