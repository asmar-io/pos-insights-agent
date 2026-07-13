// Chez Fatima — menu + ingredient + recipe catalog.
// All prices in MAD (Moroccan Dirham). Ingredient costs are per canonical unit.
// The Grand variant of Tagine d'agneau aux pruneaux is deliberately over-portioned
// (Problem #1). Baklava has a healthy margin but low ordering weight (Problem #2).
// Brochettes de poulet is heavily weighted for dinner service; the seed script
// blocks its post-20:00 sales on selected Saturdays (Problem #3). Agneau cost
// creep is applied by the seed script via stock_movements (Problem #4).

export type IngredientSpec = {
  slug: string;
  name: string;
  unit: "kg" | "g" | "L" | "cl" | "ml" | "pièce" | "unité";
  category: "viande" | "légumes" | "boissons" | "épices" | "emballage" | "autre";
  /** Value stored in ingredients.cost_per_unit at seed time. Represents the
   *  ERP's *reported* cost, not the *actual* running average from purchases. */
  costPerUnit: number;
};

export type RecipeLine = {
  ingredientSlug: string;
  /** In the ingredient's canonical unit. */
  quantity: number;
};

export type VariantSpec = {
  name: "Petit" | "Grand";
  priceDelta: number;
  /** Full recipe for this variant — overrides the base recipe entirely. */
  recipe: RecipeLine[];
};

export type ModifierSpec = {
  name: string;
  priceDelta: number;
  group?: string;
};

export type DishSpec = {
  slug: string;
  categorySlug: string;
  name: string;
  description: string;
  /** Base menu_items.price in MAD. */
  price: number;
  /** Weight used by the seed script for random dish selection. */
  popularity: number;
  /** Base recipe (used when no variant is chosen). */
  recipe: RecipeLine[];
  variants?: VariantSpec[];
  modifiers?: ModifierSpec[];
};

// ────────────────────────────────────────────────────────────
// Categories
// ────────────────────────────────────────────────────────────

export const CATEGORIES = [
  { slug: "entrees", name: "Entrées", color: "#F59E0B" },
  { slug: "tagines", name: "Tagines", color: "#DC2626" },
  { slug: "couscous", name: "Couscous", color: "#B45309" },
  { slug: "grillades", name: "Grillades", color: "#7C2D12" },
  { slug: "salades", name: "Salades", color: "#16A34A" },
  { slug: "desserts", name: "Desserts", color: "#DB2777" },
  { slug: "boissons", name: "Boissons", color: "#0891B2" },
] as const;

// ────────────────────────────────────────────────────────────
// Ingredients — costPerUnit is the ERP's "reported" value.
// Note: agneau is intentionally left at 85 MAD/kg here. The seed script
// writes stock_movements at RISING unit_cost (85 → 100 over 90 days),
// creating the "silent supplier cost creep" the agent must detect.
// ────────────────────────────────────────────────────────────

export const INGREDIENTS: IngredientSpec[] = [
  // Viandes
  { slug: "agneau", name: "Agneau", unit: "kg", category: "viande", costPerUnit: 85 },
  { slug: "poulet", name: "Poulet", unit: "kg", category: "viande", costPerUnit: 45 },
  { slug: "boeuf", name: "Boeuf", unit: "kg", category: "viande", costPerUnit: 80 },
  { slug: "poisson", name: "Poisson", unit: "kg", category: "viande", costPerUnit: 90 },
  { slug: "crevettes", name: "Crevettes", unit: "kg", category: "viande", costPerUnit: 140 },
  { slug: "oeufs", name: "Oeufs", unit: "pièce", category: "autre", costPerUnit: 1.5 },

  // Légumes / produits secs
  { slug: "oignon", name: "Oignon", unit: "kg", category: "légumes", costPerUnit: 8 },
  { slug: "tomate", name: "Tomate", unit: "kg", category: "légumes", costPerUnit: 12 },
  { slug: "aubergine", name: "Aubergine", unit: "kg", category: "légumes", costPerUnit: 10 },
  { slug: "poivron", name: "Poivron", unit: "kg", category: "légumes", costPerUnit: 15 },
  { slug: "carotte", name: "Carotte", unit: "kg", category: "légumes", costPerUnit: 8 },
  { slug: "courgette", name: "Courgette", unit: "kg", category: "légumes", costPerUnit: 12 },
  { slug: "pomme_terre", name: "Pomme de terre", unit: "kg", category: "légumes", costPerUnit: 6 },
  { slug: "citron", name: "Citron", unit: "kg", category: "légumes", costPerUnit: 15 },
  { slug: "olives", name: "Olives vertes", unit: "kg", category: "légumes", costPerUnit: 40 },
  { slug: "amandes", name: "Amandes", unit: "kg", category: "autre", costPerUnit: 120 },
  { slug: "pruneaux", name: "Pruneaux", unit: "kg", category: "autre", costPerUnit: 60 },
  { slug: "semoule", name: "Semoule", unit: "kg", category: "autre", costPerUnit: 15 },
  { slug: "farine", name: "Farine", unit: "kg", category: "autre", costPerUnit: 8 },
  {
    slug: "feuilles_brick",
    name: "Feuilles de brick",
    unit: "pièce",
    category: "emballage",
    costPerUnit: 1,
  },

  // Épices
  {
    slug: "ras_el_hanout",
    name: "Ras el hanout",
    unit: "kg",
    category: "épices",
    costPerUnit: 200,
  },
  { slug: "cumin", name: "Cumin", unit: "kg", category: "épices", costPerUnit: 80 },
  { slug: "paprika", name: "Paprika", unit: "kg", category: "épices", costPerUnit: 60 },
  { slug: "cannelle", name: "Cannelle", unit: "kg", category: "épices", costPerUnit: 100 },
  { slug: "safran", name: "Safran", unit: "g", category: "épices", costPerUnit: 30 },

  // Autres
  { slug: "huile_olive", name: "Huile d'olive", unit: "L", category: "autre", costPerUnit: 60 },
  { slug: "beurre", name: "Beurre", unit: "kg", category: "autre", costPerUnit: 80 },
  { slug: "miel", name: "Miel", unit: "kg", category: "autre", costPerUnit: 100 },
  { slug: "sucre", name: "Sucre", unit: "kg", category: "autre", costPerUnit: 12 },

  // Boissons / cafés
  { slug: "the_vert", name: "Thé vert", unit: "kg", category: "boissons", costPerUnit: 150 },
  { slug: "menthe", name: "Menthe fraîche", unit: "kg", category: "légumes", costPerUnit: 25 },
  { slug: "cafe_moulu", name: "Café moulu", unit: "kg", category: "boissons", costPerUnit: 120 },
];

// ────────────────────────────────────────────────────────────
// Dishes
// ────────────────────────────────────────────────────────────

export const DISHES: DishSpec[] = [
  // ── Entrées ────────────────────────────────────────────────
  {
    slug: "harira",
    categorySlug: "entrees",
    name: "Harira",
    description: "Soupe traditionnelle de tomate, pois chiches et lentilles.",
    price: 25,
    popularity: 8,
    recipe: [
      { ingredientSlug: "tomate", quantity: 0.1 },
      { ingredientSlug: "oignon", quantity: 0.05 },
      { ingredientSlug: "farine", quantity: 0.02 },
      { ingredientSlug: "huile_olive", quantity: 0.015 },
      { ingredientSlug: "cumin", quantity: 0.002 },
      { ingredientSlug: "paprika", quantity: 0.002 },
    ],
  },
  {
    slug: "briouates_crevettes",
    categorySlug: "entrees",
    name: "Briouates aux crevettes",
    description: "4 briouates croustillantes aux crevettes et coriandre.",
    price: 45,
    popularity: 4,
    recipe: [
      { ingredientSlug: "crevettes", quantity: 0.08 },
      { ingredientSlug: "feuilles_brick", quantity: 4 },
      { ingredientSlug: "oignon", quantity: 0.03 },
      { ingredientSlug: "huile_olive", quantity: 0.03 },
      { ingredientSlug: "cumin", quantity: 0.001 },
    ],
  },
  {
    slug: "zaalouk",
    categorySlug: "entrees",
    name: "Zaalouk",
    description: "Caviar d'aubergine à la tomate, ail et cumin.",
    price: 30,
    popularity: 5,
    recipe: [
      { ingredientSlug: "aubergine", quantity: 0.2 },
      { ingredientSlug: "tomate", quantity: 0.1 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
      { ingredientSlug: "cumin", quantity: 0.002 },
      { ingredientSlug: "paprika", quantity: 0.002 },
    ],
  },

  // ── Tagines ────────────────────────────────────────────────
  {
    // ⚠ PROBLEM #1 — Grand variant is grossly over-portioned:
    // 800g agneau vs 250g on Petit (3.2x meat) for only +25 MAD (+29% price).
    // Combined with the agneau cost creep (Problem #4), Grand margin drops
    // to single digits. The base recipe below is the Petit variant.
    slug: "tagine_agneau_pruneaux",
    categorySlug: "tagines",
    name: "Tagine d'agneau aux pruneaux",
    description: "Épaule d'agneau confite aux pruneaux, amandes et cannelle.",
    price: 85,
    popularity: 10,
    recipe: [
      { ingredientSlug: "agneau", quantity: 0.25 },
      { ingredientSlug: "pruneaux", quantity: 0.05 },
      { ingredientSlug: "amandes", quantity: 0.03 },
      { ingredientSlug: "oignon", quantity: 0.1 },
      { ingredientSlug: "cannelle", quantity: 0.002 },
      { ingredientSlug: "ras_el_hanout", quantity: 0.005 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
      { ingredientSlug: "miel", quantity: 0.015 },
    ],
    variants: [
      {
        name: "Petit",
        priceDelta: 0,
        recipe: [
          { ingredientSlug: "agneau", quantity: 0.25 },
          { ingredientSlug: "pruneaux", quantity: 0.05 },
          { ingredientSlug: "amandes", quantity: 0.03 },
          { ingredientSlug: "oignon", quantity: 0.1 },
          { ingredientSlug: "cannelle", quantity: 0.002 },
          { ingredientSlug: "ras_el_hanout", quantity: 0.005 },
          { ingredientSlug: "huile_olive", quantity: 0.02 },
          { ingredientSlug: "miel", quantity: 0.015 },
        ],
      },
      {
        name: "Grand",
        priceDelta: 25,
        recipe: [
          { ingredientSlug: "agneau", quantity: 0.8 },
          { ingredientSlug: "pruneaux", quantity: 0.1 },
          { ingredientSlug: "amandes", quantity: 0.06 },
          { ingredientSlug: "oignon", quantity: 0.15 },
          { ingredientSlug: "cannelle", quantity: 0.003 },
          { ingredientSlug: "ras_el_hanout", quantity: 0.008 },
          { ingredientSlug: "huile_olive", quantity: 0.03 },
          { ingredientSlug: "miel", quantity: 0.025 },
        ],
      },
    ],
  },
  {
    slug: "tagine_poulet_citron",
    categorySlug: "tagines",
    name: "Tagine de poulet aux olives et citron confit",
    description: "Cuisses de poulet mijotées aux olives vertes et citron confit.",
    price: 70,
    popularity: 12,
    recipe: [
      { ingredientSlug: "poulet", quantity: 0.35 },
      { ingredientSlug: "olives", quantity: 0.05 },
      { ingredientSlug: "citron", quantity: 0.05 },
      { ingredientSlug: "oignon", quantity: 0.1 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
      { ingredientSlug: "ras_el_hanout", quantity: 0.005 },
      { ingredientSlug: "safran", quantity: 0.05 },
    ],
  },
  {
    slug: "tagine_kefta_oeufs",
    categorySlug: "tagines",
    name: "Tagine kefta aux oeufs",
    description: "Boulettes de boeuf haché aux oeufs et sauce tomate épicée.",
    price: 65,
    popularity: 9,
    recipe: [
      { ingredientSlug: "boeuf", quantity: 0.2 },
      { ingredientSlug: "oeufs", quantity: 2 },
      { ingredientSlug: "tomate", quantity: 0.15 },
      { ingredientSlug: "oignon", quantity: 0.05 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
      { ingredientSlug: "cumin", quantity: 0.002 },
      { ingredientSlug: "paprika", quantity: 0.003 },
    ],
  },
  {
    slug: "tagine_poisson_legumes",
    categorySlug: "tagines",
    name: "Tagine de poisson aux légumes",
    description: "Poisson blanc aux tomates, poivrons et pommes de terre.",
    price: 75,
    popularity: 5,
    recipe: [
      { ingredientSlug: "poisson", quantity: 0.25 },
      { ingredientSlug: "tomate", quantity: 0.1 },
      { ingredientSlug: "poivron", quantity: 0.08 },
      { ingredientSlug: "pomme_terre", quantity: 0.15 },
      { ingredientSlug: "citron", quantity: 0.03 },
      { ingredientSlug: "huile_olive", quantity: 0.025 },
      { ingredientSlug: "cumin", quantity: 0.002 },
    ],
  },
  {
    slug: "tagine_boeuf_amandes",
    categorySlug: "tagines",
    name: "Tagine boeuf aux amandes",
    description: "Boeuf mijoté aux amandes grillées et miel.",
    price: 90,
    popularity: 6,
    recipe: [
      { ingredientSlug: "boeuf", quantity: 0.3 },
      { ingredientSlug: "amandes", quantity: 0.05 },
      { ingredientSlug: "oignon", quantity: 0.1 },
      { ingredientSlug: "miel", quantity: 0.02 },
      { ingredientSlug: "cannelle", quantity: 0.002 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
    ],
  },
  {
    slug: "tagine_berbere",
    categorySlug: "tagines",
    name: "Tagine berbère végétarien",
    description: "Mélange de légumes racines et pois chiches aux épices.",
    price: 55,
    popularity: 4,
    recipe: [
      { ingredientSlug: "carotte", quantity: 0.15 },
      { ingredientSlug: "courgette", quantity: 0.15 },
      { ingredientSlug: "pomme_terre", quantity: 0.15 },
      { ingredientSlug: "tomate", quantity: 0.1 },
      { ingredientSlug: "oignon", quantity: 0.05 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
      { ingredientSlug: "ras_el_hanout", quantity: 0.004 },
    ],
  },

  // ── Couscous ───────────────────────────────────────────────
  {
    slug: "couscous_royal",
    categorySlug: "couscous",
    name: "Couscous royal",
    description: "Semoule fine, agneau, poulet, merguez et 7 légumes.",
    price: 95,
    popularity: 7,
    recipe: [
      { ingredientSlug: "semoule", quantity: 0.15 },
      { ingredientSlug: "agneau", quantity: 0.15 },
      { ingredientSlug: "poulet", quantity: 0.15 },
      { ingredientSlug: "carotte", quantity: 0.1 },
      { ingredientSlug: "courgette", quantity: 0.1 },
      { ingredientSlug: "tomate", quantity: 0.08 },
      { ingredientSlug: "oignon", quantity: 0.05 },
      { ingredientSlug: "huile_olive", quantity: 0.025 },
      { ingredientSlug: "ras_el_hanout", quantity: 0.006 },
    ],
  },
  {
    slug: "couscous_poulet",
    categorySlug: "couscous",
    name: "Couscous poulet",
    description: "Semoule fine, cuisses de poulet et légumes de saison.",
    price: 70,
    popularity: 8,
    recipe: [
      { ingredientSlug: "semoule", quantity: 0.15 },
      { ingredientSlug: "poulet", quantity: 0.3 },
      { ingredientSlug: "carotte", quantity: 0.1 },
      { ingredientSlug: "courgette", quantity: 0.1 },
      { ingredientSlug: "tomate", quantity: 0.08 },
      { ingredientSlug: "oignon", quantity: 0.05 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
      { ingredientSlug: "ras_el_hanout", quantity: 0.005 },
    ],
  },
  {
    slug: "couscous_vegetarien",
    categorySlug: "couscous",
    name: "Couscous végétarien",
    description: "Semoule fine et 7 légumes en bouillon parfumé.",
    price: 50,
    popularity: 3,
    recipe: [
      { ingredientSlug: "semoule", quantity: 0.15 },
      { ingredientSlug: "carotte", quantity: 0.12 },
      { ingredientSlug: "courgette", quantity: 0.12 },
      { ingredientSlug: "pomme_terre", quantity: 0.1 },
      { ingredientSlug: "tomate", quantity: 0.1 },
      { ingredientSlug: "oignon", quantity: 0.05 },
      { ingredientSlug: "huile_olive", quantity: 0.025 },
      { ingredientSlug: "ras_el_hanout", quantity: 0.005 },
    ],
  },

  // ── Grillades ──────────────────────────────────────────────
  {
    // ⚠ PROBLEM #3 — the seed script blocks post-20:00 sales on selected
    // Saturdays to simulate a recurring weekend evening stockout pattern.
    slug: "brochettes_poulet",
    categorySlug: "grillades",
    name: "Brochettes de poulet",
    description: "4 brochettes de poulet marinées, salade et pain.",
    price: 55,
    popularity: 11,
    recipe: [
      { ingredientSlug: "poulet", quantity: 0.2 },
      { ingredientSlug: "oignon", quantity: 0.03 },
      { ingredientSlug: "huile_olive", quantity: 0.015 },
      { ingredientSlug: "paprika", quantity: 0.002 },
      { ingredientSlug: "cumin", quantity: 0.002 },
    ],
  },
  {
    slug: "brochettes_boeuf",
    categorySlug: "grillades",
    name: "Brochettes de boeuf",
    description: "4 brochettes de boeuf marinées, salade et pain.",
    price: 65,
    popularity: 8,
    recipe: [
      { ingredientSlug: "boeuf", quantity: 0.2 },
      { ingredientSlug: "oignon", quantity: 0.03 },
      { ingredientSlug: "huile_olive", quantity: 0.015 },
      { ingredientSlug: "paprika", quantity: 0.002 },
      { ingredientSlug: "cumin", quantity: 0.002 },
    ],
  },
  {
    slug: "brochettes_agneau",
    categorySlug: "grillades",
    name: "Brochettes d'agneau",
    description: "4 brochettes d'agneau marinées, salade et pain.",
    price: 75,
    popularity: 6,
    recipe: [
      { ingredientSlug: "agneau", quantity: 0.2 },
      { ingredientSlug: "oignon", quantity: 0.03 },
      { ingredientSlug: "huile_olive", quantity: 0.015 },
      { ingredientSlug: "paprika", quantity: 0.002 },
      { ingredientSlug: "cumin", quantity: 0.002 },
    ],
  },
  {
    slug: "kefta_grillee",
    categorySlug: "grillades",
    name: "Kefta grillée",
    description: "Boulettes de boeuf haché épicées grillées au charbon.",
    price: 60,
    popularity: 7,
    recipe: [
      { ingredientSlug: "boeuf", quantity: 0.22 },
      { ingredientSlug: "oignon", quantity: 0.05 },
      { ingredientSlug: "cumin", quantity: 0.003 },
      { ingredientSlug: "paprika", quantity: 0.003 },
      { ingredientSlug: "huile_olive", quantity: 0.015 },
    ],
  },
  {
    slug: "poisson_grille",
    categorySlug: "grillades",
    name: "Poisson grillé",
    description: "Filet de poisson blanc grillé, chermoula et citron.",
    price: 80,
    popularity: 4,
    recipe: [
      { ingredientSlug: "poisson", quantity: 0.25 },
      { ingredientSlug: "citron", quantity: 0.05 },
      { ingredientSlug: "huile_olive", quantity: 0.025 },
      { ingredientSlug: "paprika", quantity: 0.002 },
      { ingredientSlug: "cumin", quantity: 0.002 },
    ],
  },

  // ── Salades ────────────────────────────────────────────────
  {
    slug: "salade_marocaine",
    categorySlug: "salades",
    name: "Salade marocaine",
    description: "Tomate, concombre, oignon rouge, olives et menthe.",
    price: 25,
    popularity: 6,
    recipe: [
      { ingredientSlug: "tomate", quantity: 0.15 },
      { ingredientSlug: "oignon", quantity: 0.03 },
      { ingredientSlug: "olives", quantity: 0.02 },
      { ingredientSlug: "huile_olive", quantity: 0.015 },
      { ingredientSlug: "menthe", quantity: 0.005 },
    ],
  },
  {
    slug: "salade_cesar_marocaine",
    categorySlug: "salades",
    name: "Salade César marocaine",
    description: "Salade verte, poulet grillé, croûtons et sauce épicée.",
    price: 40,
    popularity: 4,
    recipe: [
      { ingredientSlug: "poulet", quantity: 0.1 },
      { ingredientSlug: "tomate", quantity: 0.08 },
      { ingredientSlug: "farine", quantity: 0.02 },
      { ingredientSlug: "huile_olive", quantity: 0.02 },
      { ingredientSlug: "paprika", quantity: 0.002 },
    ],
  },

  // ── Desserts ───────────────────────────────────────────────
  {
    // ⚠ PROBLEM #2 — high margin, low pick weight (popularity 1).
    // Base cost per unit is ~5.8 MAD; sold at 20 MAD → ~71% margin.
    // Volume: expected ~3-4/week. Under-promoted "hidden gem".
    slug: "baklava_miel",
    categorySlug: "desserts",
    name: "Baklava au miel",
    description: "Feuilles de brick, amandes, miel et cannelle.",
    price: 20,
    popularity: 1,
    recipe: [
      { ingredientSlug: "feuilles_brick", quantity: 2 },
      { ingredientSlug: "amandes", quantity: 0.015 },
      { ingredientSlug: "miel", quantity: 0.01 },
      { ingredientSlug: "beurre", quantity: 0.01 },
      { ingredientSlug: "cannelle", quantity: 0.001 },
      { ingredientSlug: "sucre", quantity: 0.005 },
    ],
  },
  {
    slug: "chebakia",
    categorySlug: "desserts",
    name: "Chebakia",
    description: "2 pièces de chebakia trempées dans le miel et graines de sésame.",
    price: 15,
    popularity: 3,
    recipe: [
      { ingredientSlug: "farine", quantity: 0.05 },
      { ingredientSlug: "miel", quantity: 0.02 },
      { ingredientSlug: "beurre", quantity: 0.01 },
      { ingredientSlug: "sucre", quantity: 0.01 },
    ],
  },
  {
    slug: "corne_gazelle",
    categorySlug: "desserts",
    name: "Corne de gazelle",
    description: "Pâtisserie en forme de croissant fourrée aux amandes.",
    price: 12,
    popularity: 2,
    recipe: [
      { ingredientSlug: "farine", quantity: 0.04 },
      { ingredientSlug: "amandes", quantity: 0.02 },
      { ingredientSlug: "beurre", quantity: 0.01 },
      { ingredientSlug: "sucre", quantity: 0.008 },
    ],
  },

  // ── Boissons ───────────────────────────────────────────────
  {
    slug: "the_menthe",
    categorySlug: "boissons",
    name: "Thé à la menthe",
    description: "Théière de thé vert à la menthe fraîche et sucre.",
    price: 15,
    popularity: 20,
    recipe: [
      { ingredientSlug: "the_vert", quantity: 0.005 },
      { ingredientSlug: "menthe", quantity: 0.02 },
      { ingredientSlug: "sucre", quantity: 0.02 },
    ],
    modifiers: [
      { name: "Extra menthe", priceDelta: 2, group: "extras" },
      { name: "Sans sucre", priceDelta: 0, group: "extras" },
    ],
  },
  {
    slug: "cafe",
    categorySlug: "boissons",
    name: "Café",
    description: "Café noir serré ou café au lait.",
    price: 10,
    popularity: 15,
    recipe: [{ ingredientSlug: "cafe_moulu", quantity: 0.008 }],
    modifiers: [
      { name: "Au lait", priceDelta: 2, group: "extras" },
      { name: "Double", priceDelta: 5, group: "extras" },
    ],
  },
];
