Rewrite app/quotes/builder/page.tsx with these exact changes applied. Keep every single line identical to what's currently in the file EXCEPT for the 11 modifications listed below. Do not change anything else.

CHANGE 1 — After this line:
interface MarginBracket { id: string; cost_min: number; cost_max: number | null; multiplier: number; stone_type?: string | null; }

Add this new line immediately after:
interface MarginConfig  { id: string; category: string; margin_percent: number; hourly_rate: number | null; }

---

CHANGE 2 — After this line:
// ─── Pricing ────────────────────────────────────────────────────────────────────

Add this block immediately after (before anything else in that section):
function getMetalCategory(metalType: string): string {
  const t = metalType.toLowerCase();
  if (t.includes("9ct"))      return "gold_9ct";
  if (t.includes("18ct"))     return "gold_18ct";
  if (t.includes("silver"))   return "silver";
  if (t.includes("platinum")) return "platinum";
  return "gold_9ct";
}

---

CHANGE 3 — Change the computeItemPricing function signature from:
function computeItemPricing(
  item: BuilderItem,
  metalRates: MetalRate[],
  fixedCosts: FixedCost[],
  marginBrackets: MarginBracket[],
  isManager: boolean
): ItemPricing {

To:
function computeItemPricing(
  item: BuilderItem,
  metalRates: MetalRate[],
  fixedCosts: FixedCost[],
  marginBrackets: MarginBracket[],
  isManager: boolean,
  marginConfig: MarginConfig[] = []
): ItemPricing {

---

CHANGE 4 — Replace the metalCost loop from:
  let metalCost = 0;
  for (const m of item.metals) {
    const rate = metalRates.find(r => r.metal_type === m.type);
    if (rate) metalCost += (parseFloat(m.weight) || 0) * Number(rate.price_per_gram);
  }

To:
  let metalCost = 0;
  for (const m of item.metals) {
    const rate = metalRates.find(r => r.metal_type === m.type);
    if (rate) {
      const rawCost = (parseFloat(m.weight) || 0) * Number(rate.price_per_gram);
      if (marginConfig.length > 0) {
        const cat = getMetalCategory(m.type);
        const marginPct = marginConfig.find(c => c.category === cat)?.margin_percent ?? 45;
        metalCost += rawCost * (1 + marginPct / 100);
      } else {
        metalCost += rawCost;
      }
    }
  }

---

CHANGE 5 — Replace the mainStoneCost line from:
  const mainStoneCost = item.includeMainStone && isManager && item.stoneOptions[0]
    ? (item.stoneOptions[0].stones ?? []).reduce((s, st) => s + (parseFloat(st.cost) || 0), 0)
    : 0;

To:
  const stoneCatMarginPct = marginConfig.find(c => c.category === "gold_9ct")?.margin_percent ?? 45;
  const mainStoneCost = item.includeMainStone && isManager && item.stoneOptions[0]
    ? (item.stoneOptions[0].stones ?? []).reduce((s, st) => {
        const cost = parseFloat(st.cost) || 0;
        return s + (marginConfig.length > 0 ? cost * (1 + stoneCatMarginPct / 100) : cost);
      }, 0)
    : 0;

---

CHANGE 6 — Replace the meleeCost line from:
  const meleeCost = isManager
    ? item.meleeRows.reduce((s, r) => s + (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0), 0)
    : 0;

To:
  const meleeCost = isManager
    ? item.meleeRows.reduce((s, r) => {
        const cost = (parseFloat(r.individualCost) || 0) * (parseInt(r.qty) || 0);
        return s + (marginConfig.length > 0 ? cost * (1 + stoneCatMarginPct / 100) : cost);
      }, 0)
    : 0;

---

CHANGE 7 — Replace the labour fixedCosts loop from:
  for (const fc of fixedCosts) {
    if (fc.key === "labour") { addonsCost += Number(fc.amount); costMap.labour = Number(fc.amount); }
  }

To:
  for (const fc of fixedCosts) {
    if (fc.key === "labour") {
      const labourAmt = marginConfig.length > 0
        ? (marginConfig.find(c => c.category === "labour_standard")?.hourly_rate ?? Number(fc.amount))
        : Number(fc.amount);
      addonsCost += labourAmt; costMap.labour = labourAmt;
    }
  }

---

CHANGE 8 — Replace the blended calculation block from:
  const blended = calculateBlendedRetailFromBrackets(totalCost, safeBrackets);
  const suggestedRetail = blended.retail;
  const rawPrice = blended.unrounded;
  const breakdown = blended.breakdown;

To:
  let suggestedRetail: number;
  let rawPrice: number;
  let breakdown: BlendedBreakdownLine[];
  if (marginConfig.length > 0) {
    suggestedRetail = totalCost > 0 ? Math.ceil(totalCost / 5) * 5 : 0;
    rawPrice = totalCost;
    breakdown = [];
  } else {
    const blended = calculateBlendedRetailFromBrackets(totalCost, safeBrackets);
    suggestedRetail = blended.retail;
    rawPrice = blended.unrounded;
    breakdown = blended.breakdown;
  }

---

CHANGE 9 — Replace the marginBrackets state line from:
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);

  // Customer

To:
  const [marginBrackets, setMarginBrackets] = useState<MarginBracket[]>([]);
  const [marginConfig, setMarginConfig] = useState<MarginConfig[]>([]);

  // Customer

---

CHANGE 10 — Replace the pricing useEffect from:
  useEffect(() => {
    fetch("/api/pricing", { headers: { "x-tenant-id": user?.tenantId ?? "" } })
      .then(r => r.json())
      .then(json => {
        const METAL_ORDER = ["9ct Yellow Gold", "9ct White Gold", "9ct Rose Gold", "18ct Yellow Gold", "18ct White Gold", "18ct Rose Gold", "Platinum", "Silver"];
        const sortedMetals = (json.metalRates ?? [] as MetalRate[]).slice().sort((a: MetalRate, b: MetalRate) => {
          const ai = METAL_ORDER.indexOf(a.metal_type); const bi = METAL_ORDER.indexOf(b.metal_type);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1; if (bi !== -1) return 1;
          return a.metal_type.localeCompare(b.metal_type);
        });
        setMetalRates(sortedMetals);
        setFixedCosts(json.fixedCosts ?? []);
        setMarginBrackets(json.marginBrackets ?? []);
      })
      .catch(() => {});
  }, [user?.tenantId]);

To:
  useEffect(() => {
    const headers = { "x-tenant-id": user?.tenantId ?? "" };
    fetch("/api/pricing", { headers })
      .then(r => r.json())
      .then(json => {
        const METAL_ORDER = ["9ct Yellow Gold", "9ct White Gold", "9ct Rose Gold", "18ct Yellow Gold", "18ct White Gold", "18ct Rose Gold", "Platinum", "Silver"];
        const sortedMetals = (json.metalRates ?? [] as MetalRate[]).slice().sort((a: MetalRate, b: MetalRate) => {
          const ai = METAL_ORDER.indexOf(a.metal_type); const bi = METAL_ORDER.indexOf(b.metal_type);
          if (ai !== -1 && bi !== -1) return ai - bi;
          if (ai !== -1) return -1; if (bi !== -1) return 1;
          return a.metal_type.localeCompare(b.metal_type);
        });
        setMetalRates(sortedMetals);
        setFixedCosts(json.fixedCosts ?? []);
        setMarginBrackets(json.marginBrackets ?? []);
      })
      .catch(() => {});
    fetch("/api/settings/pricing-margins", { headers })
      .then(r => r.json())
      .then((json: { rows?: MarginConfig[] }) => setMarginConfig(json.rows ?? []))
      .catch(() => {});
  }, [user?.tenantId]);

---

CHANGE 11 — Replace the allPricings useMemo from:
  const allPricings = useMemo(() =>
    items.map(item => computeItemPricing(item, metalRates, fixedCosts, marginBrackets, isManager)),
    [items, metalRates, fixedCosts, marginBrackets, isManager]
  );

To:
  const allPricings = useMemo(() =>
    items.map(item => computeItemPricing(item, metalRates, fixedCosts, marginBrackets, isManager, marginConfig)),
    [items, metalRates, fixedCosts, marginBrackets, isManager, marginConfig]
  );

---

After applying all 11 changes, confirm with a list of what was changed. Then:

git add . && git commit -m "feat: wire component-level margin config into quote builder" && git push
