const items = require("../../data/products.js");

const purchase =  (email, cartData) => {
     let order = {
       email: email,
       product: [],
     };
    let totalPrice = 0;
    cartData.forEach((item) => {
      const found = items.find((product) => product.id === item.id);
      if (!found) return res.json({ message: `Product with id ${item.id} not found` });
      else {
        order.product.push({
          id: item.id,
          quantity: item.quantity,
          price: found.price,
        });
        totalPrice += found.price * item.quantity;
      }
    });
    order.totalPrice = totalPrice;
    return order;
}

module.exports = {purchase}