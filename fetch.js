import fetch from "node-fetch";
import fs from "fs";

const DATA_FILE = "./data.json";

// Load previous data if it exists
let previous = {};
if (fs.existsSync(DATA_FILE)) {
  previous = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

// Time helpers
function now() {
  return Math.floor(Date.now() / 1000);
}

function humanTime(seconds) {
  const d = Math.floor(seconds / 86400);
  seconds %= 86400;
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);

  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);

  return parts.length ? parts.join(" ") : "0m";
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

      // Cost tracking
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
  // COST LOGIC
  //
  const oldCost = entry.cost;
  entry.lastCost = oldCost;
  entry.cost = cost;

  // costDiff = newCost - oldCost
  entry.costDiff = cost - oldCost;
}

//
// ⭐ MAIN FUNCTION ⭐
//
async function main() {
  const yata = await getYataData();
  const output = previous;

  // --- HEARTBEAT: collector is alive ---
  if (!output.__meta) output.__meta = {};
  output.__meta.lastRun = now();

  // ⭐ META TRACKING ⭐
  if (!output.__meta.started) {
    output.__meta.started = now();
    output.__meta.checks = 0;
    output.__meta.lastCheck = null;
    output.__meta.humanRuntime = "0m";
  }

  // Increment check counter
  output.__meta.checks++;

  // Update last successful check timestamp
  output.__meta.lastCheck = now();

  // Update human-readable runtime
  const runtimeSeconds = output.__meta.lastCheck - output.__meta.started;
  output.__meta.humanRuntime = humanTime(runtimeSeconds);

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
