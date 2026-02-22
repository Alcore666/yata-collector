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
  const cost = item.cost ?? null;

  if (!output[country]) output[country] = {};

  // First time seeing this item
  if (!output[country][name]) {
    output[country][name] = {
      stock,
      lastStock: stock,
      lastRestock: null,
      refills: [],
      avgInterval: null,

      // NEW COST FIELDS
      cost,
      lastCost: cost,
      costDiff: 0
    };
    return;
  }

  const entry = output[country][name];

  //
  // STOCK LOGIC
  //
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
      const intervals = [];
      for (let i = 1; i < entry.refills.length; i++) {
        intervals.push(entry.refills[i] - entry.refills[i - 1]);
      }
      entry.avgInterval = Math.round(
        intervals.reduce((a, b) => a + b, 0) / intervals.length
      );
    }
  }

  //
  // ⭐ COST LOGIC ⭐
  //
  const oldCost = entry.cost;
  entry.lastCost = oldCost;
  entry.cost = cost;

  // costDiff = newCost - oldCost
  entry.costDiff = cost - oldCost;
}

async function main() {
  const yata = await getYataData();
  const output = previous;

  // Loop through each country
  for (const country of Object.keys(yata.stocks)) {
    const items = yata.stocks[country].stocks;

    // Loop through each item in the country
    for (const item of items) {
      updateItem(country, item, output);
    }
  }

  // Save updated data
  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2));
}

main();
