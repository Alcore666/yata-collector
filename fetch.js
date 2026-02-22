import fetch from "node-fetch";
import fs from "fs";

// Path to your data file
const DATA_FILE = "./data.json";

// Load previous data or start fresh
let previous = {};
if (fs.existsSync(DATA_FILE)) {
  previous = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// Fetch YATA foreign shop data (correct endpoint)
async function getYataData() {
  const url = "https://yata.yt/api/v1/travel/data/";
  const res = await fetch(url);
  return res.json();
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function updateItem(country, itemName, stock, output) {
  if (!output[country]) output[country] = {};
  if (!output[country][itemName]) {
    output[country][itemName] = {
      stock: stock,
      lastStock: stock,
      lastRestock: null,
      refills: [],
      avgInterval: null
    };
    return;
  }

  const item = output[country][itemName];
  const oldStock = item.stock;

  // Update stock
  item.lastStock = oldStock;
  item.stock = stock;

  // Detect refill
  if (stock > oldStock) {
    const ts = now();

    // Update lastRestock
    item.lastRestock = ts;

    // Add to refill history
    item.refills.push(ts);

    // Keep only last 5
    if (item.refills.length > 5) {
      item.refills = item.refills.slice(-5);
    }

    // Calculate average interval
    if (item.refills.length >= 2) {
      let intervals = [];
      for (let i = 1; i < item.refills.length; i++) {
        intervals.push(item.refills[i] - item.refills[i - 1]);
      }
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      item.avgInterval = Math.round(avg);
    }
  }
}

async function main() {
  const yata = await getYataData();
  const output = previous;

  // Correct structure: yata.countries[country].items[item].in_stock
  for (const country of Object.keys(yata.countries)) {
    const items = yata.countries[country].items;

    for (const itemName of Object.keys(items)) {
      const stock = items[itemName].in_stock;
      updateItem(country, itemName, stock, output);
    }
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2));
}

main();
