const express = require("express");
require("dotenv").config();
const productRoute = require("./routes/product");
const ordersRoutes = require("./routes/orders");
const purchaseRoute = require("./routes/checkout");
const adminRoutes = require("./routes/admin");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("../swaggerConfig");

const app = express();
const router = express.Router();
let port = process.env.PORT || 5200;
// Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// middleware to parse body
app.use(express.json());

// orders routes
app.use("/orders", ordersRoutes);

//  products routes
app.use("/products", productRoute);

// purchase routes
app.use("/checkout", purchaseRoute);

app.use("/admin", adminRoutes);

// creating a dummy route
app.get("/", (req, res) => {
  res.send("Hello World");
});

// Creating a node server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
