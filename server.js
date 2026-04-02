require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DASHBOARD_PASSWORD = "admin123";
const AUTH_COOKIE = "dashboard_auth";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

function isDashboardAuthenticated(req) {
  const cookieHeader = req.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${AUTH_COOKIE}=1`);
}

const orderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    product: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

app.post("/api/orders", async (req, res) => {
  try {
    const { name, phone, product, price, totalPrice } = req.body;

    if (!name || !phone || !product || price == null || totalPrice == null) {
      return res.status(400).json({
        message:
          "name, phone, product, price, and totalPrice are all required.",
      });
    }

    const order = await Order.create({
      name: String(name).trim(),
      phone: String(phone).trim(),
      product: String(product).trim(),
      price: Number(price),
      totalPrice: Number(totalPrice),
    });

    return res.status(201).json(order);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to save order.", error: error.message });
  }
});

app.get("/api/orders", async (_req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    return res.json(orders);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch orders.", error: error.message });
  }
});

app.delete("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid order id." });
    }

    const deleted = await Order.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Order not found." });
    }

    return res.status(204).send();
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to delete order.", error: error.message });
  }
});

app.get("/login", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "login.html"));
});

app.post("/login", (req, res) => {
  const { password } = req.body;

  if (password !== DASHBOARD_PASSWORD) {
    return res.status(401).sendFile(path.join(__dirname, "public", "login.html"));
  }

  res.setHeader("Set-Cookie", `${AUTH_COOKIE}=1; Path=/; HttpOnly; SameSite=Lax`);
  return res.redirect("/dashboard");
});

app.get("/dashboard", (req, res) => {
  if (!isDashboardAuthenticated(req)) {
    return res.redirect("/login");
  }

  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (!MONGODB_URI) {
  console.error("MongoDB connection failed: MONGODB_URI is not set.");
  process.exit(1);
}

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log("MongoDB connected.");
    app.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("MongoDB connection failed:", error.message);
    process.exit(1);
  });
