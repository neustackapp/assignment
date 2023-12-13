const { getAllOrders } = require("../../data/orders");

const getPurchaseSummary = () => {
  // Get all orders details
  let ordersPlaced = getAllOrders();
  // Get total amount, total discount amount, items purchased and discount codes
  let itemsPurchased = [],
    totalAmount = 0,
    discountCodes = [],
    totalDiscountAmount = 0;

  ordersPlaced.forEach((order, index) => {
    totalAmount += order.totalPrice;
    itemsPurchased.push(
      ...order.product.flatMap((item) => {
        return { id: item.id };
      })
    );
    if (order.discount) {
      discountCodes.find((code) => code === order.discountCode) ? null : discountCodes.push(order.discountCode);
      totalDiscountAmount += (order.totalPrice * parseInt(order.discount.split("%")[0])) / 100;
    }
  });
  return { totalAmount, totalDiscountAmount, itemsPurchased, discountCodes };
};

module.exports = { getPurchaseSummary };
