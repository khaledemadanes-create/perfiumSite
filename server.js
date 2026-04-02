require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();
app.set("trust proxy", 1);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const DASHBOARD_PASSWORD = "admin123";
const AUTH_COOKIE = "dashboard_auth";
const viewsDir = path.join(__dirname, "views");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function isDashboardAuthenticated(req) {
  const cookieHeader = req.headers.cookie || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .some((part) => part === `${AUTH_COOKIE}=1`);
}

function buildAuthCookie(req) {
  const parts = [`${AUTH_COOKIE}=1`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (req.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

/** Clears the auth cookie so the next visit to /dashboard requires the password again. */
function buildClearAuthCookie(req) {
  const parts = [
    `${AUTH_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ];
  if (req.secure) {
    parts.push("Secure");
  }
  return parts.join("; ");
}

const cartItemSchema = new mongoose.Schema(
  {
    product: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: "" },
    items: { type: [cartItemSchema], default: [] },
    totalPrice: { type: Number, required: true, min: 0 },
    product: { type: String, trim: true },
    price: { type: Number, min: 0 },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

app.post("/api/orders", async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const { name, phone, address, items } = body;

    const nameTrim = String(name || "").trim();
    const phoneTrim = String(phone || "").trim();
    const addressTrim = String(address || "").trim();

    if (!nameTrim || !phoneTrim || !addressTrim) {
      return res.status(400).json({
        message:
          "اكمل الاسم ورقم الهاتف والعنوان (سطر العنوان ماينفع يكون فاضي).",
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "السلة فاضية — أضف منتج واحد على الأقل قبل إرسال الطلب.",
      });
    }

    const normalizedItems = items.map((row) => ({
      product: String(row.product || "").trim(),
      price: Number(row.price),
      quantity: Math.max(1, Math.floor(Number(row.quantity))),
    }));

    if (
      normalizedItems.some(
        (row) => !row.product || Number.isNaN(row.price) || row.price < 0
      )
    ) {
      return res.status(400).json({
        message: "كل منتج لازم يكون له اسم وسعر صحيح.",
      });
    }

    const totalPrice = normalizedItems.reduce(
      (sum, row) => sum + row.price * row.quantity,
      0
    );

    const order = await Order.create({
      name: nameTrim,
      phone: phoneTrim,
      address: addressTrim,
      items: normalizedItems,
      totalPrice,
    });

    return res.status(201).json(order);
  } catch (error) {
    console.error("POST /api/orders failed:", error);
    return res.status(500).json({
      message: "ما قدرناش نحفظ الطلب. جرّب تاني أو تأكد إن قاعدة البيانات متصلة.",
      detail: error.message,
    });
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
  res.sendFile(path.join(viewsDir, "login.html"));
});

app.post("/login", (req, res) => {
  const { password } = req.body;

  if (password !== DASHBOARD_PASSWORD) {
    return res.status(401).sendFile(path.join(viewsDir, "login.html"));
  }

  res.setHeader("Set-Cookie", buildAuthCookie(req));
  return res.redirect("/dashboard");
});

app.get("/dashboard", (req, res) => {
  if (!isDashboardAuthenticated(req)) {
    return res.redirect("/login");
  }

  res.setHeader("Set-Cookie", buildClearAuthCookie(req));
  res.sendFile(path.join(viewsDir, "dashboard.html"));
});

app.get("/dashboard.html", (_req, res) => {
  res.redirect(301, "/dashboard");
});

app.get("/login.html", (_req, res) => {
  res.redirect(301, "/login");
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use(express.static(path.join(__dirname, "public")));

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
