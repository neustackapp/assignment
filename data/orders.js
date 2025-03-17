const ordersPlaced =[];

const addOrders = (order)=>{
    ordersPlaced.push(order)
}
const getAllOrders = ()=>{
    return ordersPlaced;
}
module.exports = {
  getAllOrders,
  addOrders
};