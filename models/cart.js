const mongoose = require("mongoose");
const Product = require("../models/product");

const cartSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  CustomerId: String,
  Product: mongoose.Schema.Types.Mixed,
  rentedDays: String,
  rentedAmount: Number
});

const Cart = mongoose.model("Cart", cartSchema);

module.exports = Cart;
