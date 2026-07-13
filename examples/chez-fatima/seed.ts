// Chez Fatima — deterministic SQLite seed script.
//
// Runs with `npm run seed`. Rebuilds `examples/chez-fatima/data.db` from
// scratch on every invocation. Uses mulberry32(42) so every run produces
// byte-identical output — golden tests depend on this.
//
// The four planted problems:
//   #1 Grand tagine agneau over-portioned (see catalog.ts)
//   #2 baklava_miel high margin, low popularity (see catalog.ts)
//   #3 brochettes_poulet stockout after 20:00 on 5 of last 12 Saturdays
//   #4 agneau supplier cost creep — weekly stock_movements 85 → 100 MAD/kg

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { CATEGORIES, DISHES, INGREDIENTS } from "./catalog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TENANT_ID = "00000000-0000-4000-8000-000000000001";
const STORE_ID = "00000000-0000-4000-8000-000000000002";
const END_DATE = "2026-07-13"; // Monday
const DAYS = 90;
const SEED = 42;
const AGNEAU_START_COST = 85;
const AGNEAU_END_COST = 100;
const WEEKLY_DELIVERY_WEEKS = 13;
const BLOCKED_SATURDAY_COUNT = 5;
const SATURDAY_LOOKBACK = 12;

// ────────────────────────────────────────────────────────────
// Deterministic RNG (mulberry32) + seeded UUID v4-shaped strings
// ────────────────────────────────────────────────────────────

function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededUuid(rng: () => number): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(rng() * 256);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ────────────────────────────────────────────────────────────
// Date + selection helpers (UTC ISO strings only)
// ────────────────────────────────────────────────────────────

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dow(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

function toTs(dateIso: string, h: number, m: number, s: number): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${dateIso}T${pad(h)}:${pad(m)}:${pad(s)}.000Z`;
}

function pickWeighted<T>(rng: () => number, items: { item: T; weight: number }[]): T {
  if (items.length === 0) throw new Error("pickWeighted: empty pool");
  const total = items.reduce((s, x) => s + x.weight, 0);
  let r = rng() * total;
  for (const { item, weight } of items) {
    r -= weight;
    if (r < 0) return item;
  }
  const last = items[items.length - 1];
  if (!last) throw new Error("pickWeighted: unreachable");
  return last.item;
}

function pickIndexByWeight(rng: () => number, weights: number[]): number {
  if (weights.length === 0) throw new Error("pickIndexByWeight: empty weights");
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

// ────────────────────────────────────────────────────────────
// Seeder
// ────────────────────────────────────────────────────────────

function seed(): void {
  const rng = makeRng(SEED);
  const dbPath = join(__dirname, "data.db");
  const schemaPath = join(__dirname, "schema.sql");

  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");

  const tables = [
    "order_items",
    "orders",
    "stock_movements",
    "recipes",
    "item_modifiers",
    "item_variants",
    "menu_items",
    "menu_categories",
    "ingredients",
    "stores",
    "tenants",
  ];
  for (const t of tables) db.exec(`DROP TABLE IF EXISTS ${t};`);

  db.exec(readFileSync(schemaPath, "utf8"));

  const nowIso = toTs(END_DATE, 12, 0, 0);
  const startDate = addDays(END_DATE, -(DAYS - 1));

  db.prepare("INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)").run(
    TENANT_ID,
    "Chez Fatima",
    nowIso,
  );
  db.prepare(
    "INSERT INTO stores (id, tenant_id, name, city, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(STORE_ID, TENANT_ID, "Chez Fatima — Marrakech", "Marrakech", nowIso);

  const categoryIdBySlug = new Map<string, string>();
  const insertCategory = db.prepare(
    "INSERT INTO menu_categories (id, tenant_id, name, color, position, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
  );
  CATEGORIES.forEach((cat, i) => {
    const id = seededUuid(rng);
    categoryIdBySlug.set(cat.slug, id);
    insertCategory.run(id, TENANT_ID, cat.name, cat.color, i, nowIso);
  });

  const ingredientIdBySlug = new Map<string, string>();
  const insertIngredient = db.prepare(
    "INSERT INTO ingredients (id, tenant_id, name, unit, cost_per_unit, category, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)",
  );
  for (const ing of INGREDIENTS) {
    const id = seededUuid(rng);
    ingredientIdBySlug.set(ing.slug, id);
    insertIngredient.run(id, TENANT_ID, ing.name, ing.unit, ing.costPerUnit, ing.category, nowIso);
  }

  type DishInfo = {
    id: string;
    price: number;
    variants: { name: string; id: string; priceDelta: number }[];
    modifiers: { id: string; name: string; priceDelta: number }[];
  };
  const dishInfoBySlug = new Map<string, DishInfo>();

  const insertItem = db.prepare(
    "INSERT INTO menu_items (id, tenant_id, category_id, name, description, price, position, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
  );
  const insertVariant = db.prepare(
    "INSERT INTO item_variants (id, item_id, name, price_delta, sort_order) VALUES (?, ?, ?, ?, ?)",
  );
  const insertModifier = db.prepare(
    "INSERT INTO item_modifiers (id, item_id, name, price_delta, is_required, sort_order, group_name) VALUES (?, ?, ?, ?, 0, ?, ?)",
  );
  const insertRecipe = db.prepare(
    "INSERT INTO recipes (id, tenant_id, item_id, variant_id, ingredient_id, quantity_used, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );

  DISHES.forEach((dish, i) => {
    const itemId = seededUuid(rng);
    const catId = categoryIdBySlug.get(dish.categorySlug);
    if (!catId) throw new Error(`Missing category '${dish.categorySlug}' for dish '${dish.slug}'`);
    insertItem.run(itemId, TENANT_ID, catId, dish.name, dish.description, dish.price, i, nowIso);

    for (const line of dish.recipe) {
      const ingId = ingredientIdBySlug.get(line.ingredientSlug);
      if (!ingId)
        throw new Error(`Missing ingredient '${line.ingredientSlug}' in dish '${dish.slug}'`);
      insertRecipe.run(seededUuid(rng), TENANT_ID, itemId, null, ingId, line.quantity, nowIso);
    }

    const variants: DishInfo["variants"] = [];
    if (dish.variants) {
      dish.variants.forEach((v, vi) => {
        const vId = seededUuid(rng);
        insertVariant.run(vId, itemId, v.name, v.priceDelta, vi);
        variants.push({ name: v.name, id: vId, priceDelta: v.priceDelta });
        for (const line of v.recipe) {
          const ingId = ingredientIdBySlug.get(line.ingredientSlug);
          if (!ingId)
            throw new Error(`Missing ingredient '${line.ingredientSlug}' in variant '${v.name}'`);
          insertRecipe.run(seededUuid(rng), TENANT_ID, itemId, vId, ingId, line.quantity, nowIso);
        }
      });
    }

    const modifiers: DishInfo["modifiers"] = [];
    if (dish.modifiers) {
      dish.modifiers.forEach((m, mi) => {
        const mId = seededUuid(rng);
        insertModifier.run(mId, itemId, m.name, m.priceDelta, mi, m.group ?? null);
        modifiers.push({ id: mId, name: m.name, priceDelta: m.priceDelta });
      });
    }

    dishInfoBySlug.set(dish.slug, { id: itemId, price: dish.price, variants, modifiers });
  });

  // ── Problem #4: agneau weekly deliveries with rising unit_cost ──
  const agneauId = ingredientIdBySlug.get("agneau");
  if (!agneauId) throw new Error("agneau ingredient missing");
  const insertMovement = db.prepare(
    "INSERT INTO stock_movements (id, tenant_id, store_id, ingredient_id, movement_type, quantity_delta, unit_cost, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (let w = 0; w < WEEKLY_DELIVERY_WEEKS; w++) {
    const t = w / (WEEKLY_DELIVERY_WEEKS - 1);
    const cost = AGNEAU_START_COST + (AGNEAU_END_COST - AGNEAU_START_COST) * t;
    const dateIso = addDays(startDate, w * 7);
    insertMovement.run(
      seededUuid(rng),
      TENANT_ID,
      STORE_ID,
      agneauId,
      "purchase",
      25,
      Math.round(cost * 100) / 100,
      `Livraison hebdomadaire agneau (S${w + 1})`,
      toTs(dateIso, 8, 0, 0),
    );
  }

  // ── Problem #3: pick 5 of the last 12 Saturdays for evening stockout ──
  const saturdays: string[] = [];
  for (let d = 0; d < DAYS && saturdays.length < SATURDAY_LOOKBACK; d++) {
    const iso = addDays(END_DATE, -d);
    if (dow(iso) === 6) saturdays.push(iso);
  }
  const shuffled = [...saturdays];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) continue;
    shuffled[i] = b;
    shuffled[j] = a;
  }
  const blockedSaturdays = new Set(shuffled.slice(0, BLOCKED_SATURDAY_COUNT));

  // ── Orders + order_items ──
  const insertOrder = db.prepare(
    "INSERT INTO orders (id, tenant_id, store_id, status, payment_method, order_type, subtotal, tax, discount, total, created_at) VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, 0, ?, ?)",
  );
  const insertOrderItem = db.prepare(
    "INSERT INTO order_items (id, order_id, item_id, variant_id, item_name, variant_name, modifier_names, quantity, unit_price, line_total, discount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
  );

  // Sunday .. Saturday
  const DOW_WEIGHTS = [1.3, 0.7, 0.75, 0.85, 1.0, 1.35, 1.55];
  // Lunch peak 12-14, tea/quiet 15-18, dinner peak 19-22, wind-down 23
  const HOUR_WEIGHTS = [
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.5, 3.5, 4.0, 2.5, 1.0, 1.0, 1.0, 1.2, 2.5, 3.5, 3.5, 2.0,
    0.8,
  ];
  const LINE_COUNT_WEIGHTS = [1, 4, 3, 1]; // idx 0..3 → 1..4 items

  const dishWeights = DISHES.map((d) => ({ item: d, weight: d.popularity }));
  const paymentMethods = [
    { item: "cash", weight: 0.6 },
    { item: "tpe", weight: 0.3 },
    { item: "mixte", weight: 0.1 },
  ];
  const orderTypes = [
    { item: "sur_place", weight: 0.8 },
    { item: "emporter", weight: 0.15 },
    { item: "livraison", weight: 0.05 },
  ];

  const insertAll = db.transaction(() => {
    for (let d = 0; d < DAYS; d++) {
      const dateIso = addDays(startDate, d);
      const baseOrders = 30 * (DOW_WEIGHTS[dow(dateIso)] ?? 1);
      const jitter = 1 + (rng() - 0.5) * 0.4;
      const nOrders = Math.max(5, Math.round(baseOrders * jitter));
      const blockPoulet = blockedSaturdays.has(dateIso);

      for (let o = 0; o < nOrders; o++) {
        const hour = pickIndexByWeight(rng, HOUR_WEIGHTS);
        const minute = Math.floor(rng() * 60);
        const second = Math.floor(rng() * 60);
        const ts = toTs(dateIso, hour, minute, second);
        const lineCount = pickIndexByWeight(rng, LINE_COUNT_WEIGHTS) + 1;
        const pool =
          blockPoulet && hour >= 20
            ? dishWeights.filter((x) => x.item.slug !== "brochettes_poulet")
            : dishWeights;

        const orderId = seededUuid(rng);
        let subtotal = 0;
        const lines: Array<{
          id: string;
          itemId: string;
          variantId: string | null;
          itemName: string;
          variantName: string | null;
          modifierNames: string[];
          quantity: number;
          unitPrice: number;
          lineTotal: number;
        }> = [];

        for (let li = 0; li < lineCount; li++) {
          const dish = pickWeighted(rng, pool);
          const info = dishInfoBySlug.get(dish.slug);
          if (!info) throw new Error(`Missing dish info '${dish.slug}'`);

          let variantId: string | null = null;
          let variantName: string | null = null;
          let priceDelta = 0;
          if (info.variants.length > 0) {
            // Slight bias toward Grand — mimics upsell success on tagines
            const vIdx = pickIndexByWeight(
              rng,
              info.variants.map((v) => (v.name === "Grand" ? 0.55 : 0.45)),
            );
            const v = info.variants[vIdx];
            if (!v) throw new Error("unreachable: variant index out of bounds");
            variantId = v.id;
            variantName = v.name;
            priceDelta = v.priceDelta;
          }

          const chosenMods: { name: string; priceDelta: number }[] = [];
          for (const m of info.modifiers) {
            if (rng() < 0.3) chosenMods.push({ name: m.name, priceDelta: m.priceDelta });
          }
          const modDelta = chosenMods.reduce((s, m) => s + m.priceDelta, 0);

          const quantity = rng() < 0.8 ? 1 : 2;
          const unitPrice = Math.round((info.price + priceDelta + modDelta) * 100) / 100;
          const lineTotal = Math.round(unitPrice * quantity * 100) / 100;

          subtotal += lineTotal;
          lines.push({
            id: seededUuid(rng),
            itemId: info.id,
            variantId,
            itemName: dish.name,
            variantName,
            modifierNames: chosenMods.map((m) => m.name),
            quantity,
            unitPrice,
            lineTotal,
          });
        }

        subtotal = Math.round(subtotal * 100) / 100;
        const tax = Math.round(subtotal * 0.1 * 100) / 100;
        const total = Math.round((subtotal + tax) * 100) / 100;
        const paymentMethod = pickWeighted(rng, paymentMethods);
        const orderType = pickWeighted(rng, orderTypes);

        insertOrder.run(
          orderId,
          TENANT_ID,
          STORE_ID,
          paymentMethod,
          orderType,
          subtotal,
          tax,
          total,
          ts,
        );
        for (const line of lines) {
          insertOrderItem.run(
            line.id,
            orderId,
            line.itemId,
            line.variantId,
            line.itemName,
            line.variantName,
            JSON.stringify(line.modifierNames),
            line.quantity,
            line.unitPrice,
            line.lineTotal,
          );
        }
      }
    }
  });
  insertAll();

  const orderCount = db.prepare("SELECT COUNT(*) AS n FROM orders").get() as { n: number };
  const itemCount = db.prepare("SELECT COUNT(*) AS n FROM order_items").get() as { n: number };
  const moveCount = db.prepare("SELECT COUNT(*) AS n FROM stock_movements").get() as { n: number };

  console.log(`OK  seeded ${dbPath}`);
  console.log(`    tenant             Chez Fatima (${TENANT_ID})`);
  console.log(`    store              Chez Fatima — Marrakech (${STORE_ID})`);
  console.log(`    date range         ${startDate} → ${END_DATE}  (${DAYS} days)`);
  console.log(`    orders             ${orderCount.n}`);
  console.log(`    order_items        ${itemCount.n}`);
  console.log(`    stock_movements    ${moveCount.n}`);
  console.log(`    blocked Saturdays  ${[...blockedSaturdays].sort().join(", ")}`);

  db.close();
}

seed();
