const express = require("express");
const mongoose = require("mongoose");
const Order = require("../models/order");
const User = require("../models/user");
const ProductQty = require("../models/productQty");
const { v4: uuidv4 } = require("uuid");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    Order.find().then((result) => {
      res.json(result);
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).send("Internal Server Error");
  }
});

// Customer current order
router.get("/hold/:customerId", async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const orders = await Order.find({ customerId: customerId })
      .sort({ _id: -1 })
      .exec();
    console.log(orders);
    res.json(orders);
  } catch (err) {
    console.error("Error fetching customer orders:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/get/:status", async (req, res) => {
  try {
    const status = req.params.status;
    console.log("status => ", status);
    let reqStatus = "";
    if (status === "placed") {
      reqStatus = "Placed";
    } else if (status === "accepted") {
      reqStatus = "Accepted";
    } else if (status === "packed") {
      reqStatus = "Packed";
    } else if (status === "ontheway") {
      reqStatus = "OnTheWay";
    } else if (status === "delivered") {
      reqStatus = "Delivered";
    } else if (status === "returnTime") {
      reqStatus = "Returned";
    } else if (status === "toyCheck") {
      reqStatus = "ToyChecked";
    } else if (status === "closed") {
      reqStatus = "Closed";
    } else if (status === "all") {
      reqStatus = "";
    }
    console.log("reqStatus => ", reqStatus);
    if (reqStatus === "") {
      const orders = await Order.find({ orderTotal: { $gt: 0 } })
        .sort({ _id: -1 })
        .exec();
      console.log("get  all orders ", orders);
      res.json(orders);
    } else {
      const orders = await Order.find({
        Status: reqStatus,
        orderTotal: { $gt: 0 },
      })
        .sort({ _id: -1 })
        .exec();
      console.log("get orders by status ", orders);
      const mergedOrders = orders.reduce((acc, order) => {
        if (!acc[order.customerId]) {
          acc[order.customerId] = {
            ...order.toObject(),
            products: [...order.products],
            orderTotal: order.orderTotal,
          };
        } else {
          acc[order.customerId].products.push(...order.products);
          acc[order.customerId].orderTotal += order.orderTotal;
        }
        return acc;
      }, {});

      const mergedOrdersArray = Object.values(mergedOrders);
      console.log("merged orders by customer id", mergedOrdersArray);
      res.json(mergedOrdersArray);
    }
  } catch (err) {
    console.error("Error updating customer order state:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.get("/changeState/:storeId/:customerId/:orderId", async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const orderId = req.params.orderId;
    const customerId = req.params.customerId;
    console.log("orderId => ", orderId);
    console.log("customerId => ", customerId);
    const orders = await Order.find({ orderId, customerId, storeId });
    console.log("orders => ", orders);
    for (const order of orders) {
      let newState = "";
      if (order.Status === "Placed") {
        newState = "Accepted";
      } else if (order.Status === "Accepted") {
        newState = "Packed";
      } else if (order.Status === "Packed") {
        newState = "OnTheWay";
      } else if (order.Status === "OnTheWay") {
        newState = "Delivered";
      } else if (order.Status === "Delivered") {
        newState = "ReturnTime";
      } else if (order.Status === "ReturnTime") {
        newState = "Returned";
      } else if (order.Status === "Returned") {
        newState = "ToyChecked";
      } else if (order.Status === "ToyChecked") {
        newState = "Closed";
      }
      console.log("new State => ", newState);
      await order.updateOne({ Status: newState, orderId, customerId, storeId });
    }
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating customer order state:", err);
    res.status(500).send("Internal Server Error");
  }
});

router.post("/order", async (req, res) => {
  try {
    console.log("rr => ", req.body);
    const { storeId, products, ...remaining } = req.body;
    console.log("remainign => ", remaining);
    // order placed for customer - irrespective of different stores
    const order = await placeOrder(products, remaining, storeId);
    console.log("order => ", order);
    res.json({ success: true });
  } catch (err) {
    console.error("Error placing order:", err);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;

async function placeOrder(products, remaining, orderStoreId) {
  console.log("order storeId => ", orderStoreId);
  // const session = await mongoose.startSession();
  // session.startTransaction();
  const {
    customerId,
    Status,
    orderDate,
    orderTotal,
    isNewCustomer,
    addonDeposit,
  } = remaining;
  let order = null;
  let orderId = uuidv4();
  console.log("orderId => ", orderId);
  order = new Order({
    originalCustomerId: customerId,
    customerId,
    products: [],
    Status,
    orderDate,
    orderTotal,
    AddonDeposit: addonDeposit,
    storeId: orderStoreId,
    orderId,
  });
  const mainOrderWithoutProducts = order.save();
  console.log("products => ", products);
  for (const productEntity of products) {
    console.log("productEntity => ", productEntity);
    let prodOrder = null;
    let storeToUpdate = "";
    if (productEntity?.product?.StoreId === orderStoreId) {
      prodOrder = new Order({
        originalCustomerId: customerId,
        customerId,
        products: [productEntity],
        Status,
        orderDate,
        orderTotal: 0,
        AddonDeposit: 0,
        storeId: orderStoreId,
        orderId,
      });
      storeToUpdate = orderStoreId;
      console.log("if", storeToUpdate);
    } else {
      const product = productEntity.product;
      prodOrder = new Order({
        originalCustomerId: customerId,
        customerId: orderStoreId,
        products: [productEntity],
        Status,
        orderDate,
        orderTotal: productEntity.rentedAmount * 0.9,
        AddonDeposit: 0,
        storeId: product?.StoreId,
        orderId,
      });
      storeToUpdate = product?.StoreId;
      console.log("else", storeToUpdate);
    }
    console.log("prodOrder ===>>>> ", prodOrder, storeToUpdate);
    // const order1 = await order.save({ session });
    const subOrderWithProduct = await prodOrder.save();
    console.log("subOrderWithProduct => ", subOrderWithProduct);
    const productUpdated = await updateProductCount(
      productEntity,
      storeToUpdate
    );
  }
  const userUpdated = await getUserAndUpdate(customerId, isNewCustomer);
  console.log("userUpdated => ", userUpdated);
  // await session.commitTransaction();
  // session.endSession();

  return { success: true };
}

async function updateProductCount(productEntity, storeId) {
  try {
    console.log("product1 => ", productEntity, productEntity.return);
    const prod = productEntity.product;
    console.log(
      "Fetching product with code:",
      prod.prefQtyCode,
      storeId,
      prod.StoreId === storeId
    );
    // update product quantity only when storeId matches
    if (prod.StoreId === storeId) {
      const productQty = await ProductQty.findOne({
        QtyCode: prod.prefQtyCode,
        StoreId: storeId,
      });
      console.log("productQty => ", productQty);
      if (productQty) {
        console.log("Fetched product => ", productQty);
        productQty.NextAvailable = addDays(productEntity.return, 3);

        productQty.TimesRented += 1;
        productQty.Earned += productEntity.rentedAmount;
        await productQty.save();
        console.log(
          "Product quantity reduced successfully. Updated product:",
          productQty
        );
      } else {
        console.error("Error: Document not found for code:", prod.Code);
      }
    } else {
      console.log("Product not found for code:", prod.Code);
    }
  } catch (error) {
    console.error("Error fetching or updating product:", error);
  }
}

async function getUserAndUpdate(customerId, isNewCustomer) {
  const user = await User.findOne({ CustomerId: customerId });
  console.log("user => ", user);
  user.cartCount = 0;
  if (isNewCustomer) {
    user.DepositAmount = user.outsideDeliveryZone ? 2000 : 1500;
    user.Status = "Active";
  }
  await user.save();
}

function addDays(dateString, days) {
  // Parse the date string into a Date object
  let date = new Date(dateString);

  // Check if the date is valid
  if (isNaN(date.getTime())) {
    throw new Error("Invalid date string");
  }

  // Add the specified number of days
  date.setDate(date.getDate() + days);

  // Convert the date back to a string (ISO format: YYYY-MM-DDTHH:MM:SS.sssZ)
  // You can adjust the format as needed
  return date.toISOString().split("T")[0];
}
