const items = require("../../data/products.js");

const purchase =  (email, cartData, discount=0) => {
     let order = {
       email: email,
       product: [],
     };
    let totalPrice = 0;
    // Constructing orders data
    cartData.forEach((item) => {
      // Checking the product in DB
      const found = items.find((product) => product.id === item.id);
      // If not found throw error
      if (!found) return res.json({ message: `Product with id ${item.id} not found` });
      else {
        // constructing orders array
        order.product.push({
          id: item.id,
          quantity: item.quantity,
          price: found.price,
        });
        totalPrice += found.price * item.quantity;
      }
    });
    order.totalPrice = totalPrice;
    if(discount){
        order.discount = `${discount}%`;
        order.totalPrice = totalPrice - (totalPrice * discount)/100;
    }
    return order;
}

module.exports = {purchase}