require("dotenv").config();

const path = require("path");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_API_BASE_URL =
  process.env.DATA_API_BASE_URL ||
  "https://data.mongodb-api.com/app/data-/endpoint/data/v1";
const DATA_API_KEY = process.env.DATA_API_KEY;
const DATA_SOURCE = process.env.DATA_API_DATA_SOURCE || "Cluster0";
const DATABASE_NAME = process.env.DATA_API_DATABASE || "perfiumSite";
const ORDERS_COLLECTION = process.env.DATA_API_COLLECTION || "orders";

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

async function callDataApi(action, payload) {
  if (!DATA_API_KEY) {
    throw new Error("Missing DATA_API_KEY environment variable.");
  }

  const response = await fetch(`${DATA_API_BASE_URL}/action/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": DATA_API_KEY,
    },
    body: JSON.stringify({
      dataSource: DATA_SOURCE,
      database: DATABASE_NAME,
      collection: ORDERS_COLLECTION,
      ...payload,
    }),
  });

  const data = await response.json();
  if (!response.ok || data.error) {
    const message = data.error || data.error_code || "Atlas Data API request failed.";
    throw new Error(message);
  }

  return data;
}

app.post("/api/orders", async (req, res) => {
  try {
    const { name, phone, product, price, totalPrice } = req.body;

    if (!name || !phone || !product || price == null || totalPrice == null) {
      return res.status(400).json({
        message:
          "name, phone, product, price, and totalPrice are all required.",
      });
    }

    const order = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      product: String(product).trim(),
      price: Number(price),
      totalPrice: Number(totalPrice),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const result = await callDataApi("insertOne", { document: order });

    return res.status(201).json({ _id: result.insertedId, ...order });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to save order.", error: error.message });
  }
});

app.get("/api/orders", async (_req, res) => {
  try {
    const result = await callDataApi("find", {
      filter: {},
      sort: { createdAt: -1 },
    });

    return res.json(result.documents || []);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Failed to fetch orders.", error: error.message });
  }
});

app.get("/dashboard", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "dashboard.html"));
});

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
