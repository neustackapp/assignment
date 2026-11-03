const express = require('express');
const adminController = require('../controllers/adminController');

const router = express.Router();

router.get('/report', adminController.getReport);
router.post('/coupons/generate', adminController.generateCoupon);

module.exports = router;
