import fetch from "node-fetch";
import fs from "fs";

const DATA_FILE = "./data.json";

// Load previous data if it exists
let previous = {};
if (fs.existsSync(DATA_FILE)) {
  previous = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// Fetch YATA export (public endpoint)
async function getYataData() {
  const url = "https://yata.yt/api/v1/travel/export/";
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`YATA returned HTTP ${res.status}`);
  }

  return res.json();
}

function now() {
  return Math.floor(Date.now() / 1000);
}

// Update tracking for a single item
function updateItem(country, item, output) {
  const name = item.name;
  const stock = item.quantity;

  if (!output[country]) output[country] = {};

  // First time seeing this item
  if (!output[country][name]) {
    output[country][name] = {
      stock,
      lastStock: stock,
      lastRestock: null,
      refills: [],
      avgInterval: null
    };
    return;
  }

  const entry = output[country][name];
  const oldStock = entry.stock;

  entry.lastStock = oldStock;
  entry.stock = stock;

  // Detect refill
  if (stock > oldStock) {
    const ts = now();
    entry.lastRestock = ts;
    entry.refills.push(ts);

    // Keep last 5 timestamps
    if (entry.refills.length > 5) {
      entry.refills = entry.refills.slice(-5);
    }

    // Compute average interval
    if (entry.refills.length >= 2) {
      const
