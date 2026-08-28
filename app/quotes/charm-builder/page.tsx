"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@/context/UserContext";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  category: string;
  name: string;
  price: number;
  applies_to: string;
  month_number: number | null;
  sort_order: number;
}

interface BaseConfig {
  id: string;
  product_type: string;
  base_price: number | null;
  slot_fee_2: number | null;
  slot_fee_3: number | null;
  slot_fee_4: number | null;
  slot_fee_5: number | null;
  slot_fee_6: number | null;
  metal_surcharge_yellow: number | null;
  metal_surcharge_white: number | null;
  min_pendants: number;
  max_pendants: number;
}

interface AftermarketRate {
  id: string;
  charm_type: string;
  metal_colour: string;
  total_price: number;
}

interface SelectedPendant {
  catalogItemId: string;
  category: string;
  name: string;
  price: number;
}

type AppMode    = "build" | "aftermarket";
type MetalColour = "yellow" | "white";
type ProductType = "necklace" | "bracelet";
type PickerTab  = "initial" | "charm" | "birthstone" | "diamond";
type AfterMode  = "adding" | "repositioning";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHARM_TYPE_LABELS: Record<string, string> = {
  initial:       "Initial (A–Z)",
  birthstone:    "Birthstone",
  april_diamond: "April Birthstone (Diamond)",
  love_story:    "Love Story Heart",
  diamond_030ct: "0.30ct Diamond",
};

const CHARM_TYPE_ORDER = ["initial", "birthstone", "april_diamond", "love_story", "diamond_030ct"];

// ── Styles ────────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E8F0",
  borderRadius: 10,
  padding: "16px 20px",
};

const btn = (active: boolean, accent = "#635BFF"): React.CSSProperties => ({
  padding: "8px 18px",
  borderRadius: 7,
  border: `1.5px solid ${active ? accent : "#E5E7EB"}`,
  background: active ? accent : "#fff",
  color: active ? "#fff" : "#374151",
  fontWeight: active ? 600 : 400,
  fontSize: 13,
  cursor: "pointer",
});

const slotCard = (filled: boolean, active: boolean): React.CSSProperties => ({
  flex: "1 1 140px",
  minHeight: 90,
  border: `2px ${filled ? "solid" : "dashed"} ${active ? "#635BFF" : filled ? "#374151" : "#D1D5DB"}`,
  borderRadius: 10,
  padding: "12px 14px",
  cursor: "pointer",
  background: active ? "#F5F3FF" : filled ? "#F9FAFB" : "#fff",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  gap: 4,
});

const itemTile = (selected: boolean): React.CSSProperties => ({
  border: `2px solid ${selected ? "#635BFF" : "#E8E8F0"}`,
  borderRadius: 8,
  padding: "10px 12px",
  cursor: "pointer",
  background: selected ? "#F5F3FF" : "#fff",
  textAlign: "center",
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function CharmBuilderPage() {
  const { user } = useUser();
  const tenantId = user?.tenantId ?? "";

  // ── Catalog data
  const [catalog,       setCatalog]       = useState<CatalogItem[]>([]);
  const [baseConfigs,   setBaseConfigs]   = useState<Record<string, BaseConfig>>({});
  const [afterRates,    setAfterRates]    = useState<AftermarketRate[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  // ── Mode
  const [appMode,       setAppMode]       = useState<AppMode>("build");

  // ── Mode 1: build state
  const [productType,   setProductType]   = useState<ProductType>("necklace");
  const [metalColour,   setMetalColour]   = useState<MetalColour>("yellow");
  const [slots,         setSlots]         = useState<(SelectedPendant | null)[]>([null, null]);
  const [activeSlot,    setActiveSlot]    = useState<number | null>(0);
  const [pickerTab,     setPickerTab]     = useState<PickerTab>("initial");
  const [saving,        setSaving]        = useState(false);
  const [savedId,       setSavedId]       = useState<string | null>(null);

  // ── Mode 2: aftermarket state
  const [afterMode,     setAfterMode]     = useState<AfterMode | null>(null);
  const [afterMetal,    setAfterMetal]    = useState<MetalColour>("yellow");
  const [afterCharmType, setAfterCharmType] = useState<string>("initial");
  const [workshopSent,  setWorkshopSent]  = useState(false);
  const [workshopError, setWorkshopError] = useState<string | null>(null);

  // ── Load catalog + aftermarket rates on mount
  useEffect(() => {
    if (!tenantId) return;
    Promise.all([
      fetch("/api/charm-builder/catalog",    { headers: { "x-tenant-id": tenantId } }).then(r => r.json()),
      fetch("/api/charm-builder/aftermarket", { headers: { "x-tenant-id": tenantId } }).then(r => r.json()),
    ]).then(([catData, amData]) => {
      if (catData.error) { setError(catData.error); return; }
      setCatalog(catData.catalog ?? []);
      setBaseConfigs(catData.baseConfigs ?? {});
      setAfterRates(amData.rates ?? []);
    }).catch(e => setError(String(e)))
      .finally(() => setLoading(false));
  }, [tenantId]);

  // ── Derived pricing
  const config = baseConfigs[productType] as BaseConfig | undefined;
  const isUnconfirmedBracelet = productType === "bracelet" && !config?.base_price;

  const slotFee = useMemo(() => {
    if (!config) return 0;
    const key = `slot_fee_${slots.length}` as keyof BaseConfig;
    return Number(config[key] ?? 0);
  }, [config, slots.length]);

  const metalSurcharge = useMemo(() => {
    if (!config) return 0;
    return Number(metalColour === "yellow"
      ? (config.metal_surcharge_yellow ?? 0)
      : (config.metal_surcharge_white  ?? 0));
  }, [config, metalColour]);

  const pendantTotal = useMemo(
    () => slots.reduce((sum, s) => sum + (s?.price ?? 0), 0),
    [slots]
  );

  const total = useMemo(
    () => Number(config?.base_price ?? 0) + slotFee + metalSurcharge + pendantTotal,
    [config, slotFee, metalSurcharge, pendantTotal]
  );

  // ── Catalog helpers
  const catalogBy = (cat: string) => catalog.filter(i => i.category === cat);

  function selectPendant(item: CatalogItem) {
    if (activeSlot === null) return;
    const next = [...slots];
    next[activeSlot] = { catalogItemId: item.id, category: item.category, name: item.name, price: Number(item.price) };
    setSlots(next);
    // Advance to next empty slot
    const nextEmpty = next.findIndex((s, i) => i > activeSlot && s === null);
    setActiveSlot(nextEmpty === -1 ? null : nextEmpty);
  }

  function addSlot() {
    if (slots.length >= 6) return;
    const next = [...slots, null];
    setSlots(next);
    setActiveSlot(next.length - 1);
  }

  function removeSlot() {
    if (slots.length <= 2) return;
    const next = slots.slice(0, -1);
    setSlots(next);
    setActiveSlot(null);
  }

  async function handleSave() {
    if (!config?.base_price || slots.some(s => s === null)) return;
    setSaving(true);
    try {
      const res = await fetch("/api/charm-builder/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({
          product_type: productType,
          metal_colour: metalColour,
          base_price: config.base_price,
          slot_fee: slotFee,
          metal_surcharge: metalSurcharge,
          pendant_total: pendantTotal,
          total_price: total,
          pendants: slots.map(s => ({
            catalog_item_id: s!.catalogItemId,
            category: s!.category,
            name: s!.name,
            price: s!.price,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error); return; }
      setSavedId(json.id);
    } finally {
      setSaving(false);
    }
  }

  function resetBuild() {
    setSlots([null, null]);
    setActiveSlot(0);
    setSavedId(null);
    setProductType("necklace");
    setMetalColour("yellow");
  }

  async function handleSendToWorkshop() {
    setWorkshopError(null);
    try {
      const res = await fetch("/api/workshop/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({
          job_type: "repair",
          description: "Charm repositioning — requires manual workshop quote. Do not price via charm builder.",
          notes: "Customer has existing charm(s) to be repositioned. This is not a new-charm addition.",
        }),
      });
      const json = await res.json();
      if (!res.ok) { setWorkshopError(json.error ?? "Failed to send to workshop"); return; }
      setWorkshopSent(true);
    } catch (e) {
      setWorkshopError(String(e));
    }
  }

  // ── Aftermarket rate lookup
  const afterRate = afterRates.find(
    r => r.charm_type === afterCharmType && r.metal_colour === afterMetal
  );

  // ── Render: loading / error
  if (loading) {
    return (
      <div style={{ padding: 40, color: "#6B7280", fontSize: 14 }}>Loading charm catalog…</div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: 40, color: "#DC2626", fontSize: 14 }}>Error: {error}</div>
    );
  }

  // ── Render: picker tab content
  function PendantPicker() {
    const tabs: { key: PickerTab; label: string }[] = [
      { key: "initial",    label: "Initial" },
      { key: "charm",      label: "Charm" },
      { key: "birthstone", label: "Birthstone" },
      { key: "diamond",    label: "Diamond" },
    ];
    const selectedId = activeSlot !== null ? slots[activeSlot]?.catalogItemId : undefined;

    const items: CatalogItem[] = pickerTab === "initial"
      ? [...catalogBy("alphabet"), ...catalogBy("diamond_alphabet")]
      : pickerTab === "charm"
      ? catalogBy("named_charm")
      : pickerTab === "birthstone"
      ? catalogBy("birthstone")
      : catalogBy("diamond_shape");

    return (
      <div style={{ ...card, marginTop: 12, border: "1.5px solid #635BFF" }}>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          {tabs.map(t => (
            <button key={t.key} onClick={() => setPickerTab(t.key)} style={btn(pickerTab === t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {pickerTab === "initial" && (
          <p style={{ fontSize: 11, color: "#6B7280", marginBottom: 10 }}>
            Plain initial · Any letter A–Z
          </p>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => selectPendant(item)}
              style={itemTile(item.id === selectedId)}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{item.name}</div>
              {item.category === "diamond_alphabet" && (
                <div style={{ fontSize: 10, color: "#7C3AED", marginTop: 1 }}>Diamond-set</div>
              )}
              <div style={{ fontSize: 13, color: "#635BFF", fontWeight: 600, marginTop: 4 }}>
                ${Number(item.price).toFixed(0)}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Render: Mode 1 — New Build
  function ModeBuild() {
    const allFilled = slots.every(s => s !== null);
    const canSave   = allFilled && !!config?.base_price && !isUnconfirmedBracelet;

    if (savedId) {
      return (
        <div style={{ ...card, textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>✓</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "#111827", marginBottom: 4 }}>Build saved</div>
          <div style={{ fontSize: 13, color: "#6B7280", marginBottom: 20 }}>
            Total: <strong>${total.toFixed(0)}</strong> · {slots.length} pendant{slots.length !== 1 ? "s" : ""} ·{" "}
            {metalColour === "yellow" ? "Yellow" : "White"} Gold
          </div>
          <button onClick={resetBuild} style={{ ...btn(true), marginRight: 8 }}>New Build</button>
        </div>
      );
    }

    return (
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flexWrap: "wrap" }}>

        {/* ── Left: builder ─────────────────────────────────────────── */}
        <div style={{ flex: "1 1 420px" }}>

          {/* Product type */}
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Product</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setProductType("necklace")} style={btn(productType === "necklace")}>Necklace</button>
              <button onClick={() => setProductType("bracelet")} style={btn(productType === "bracelet")}>
                Bracelet
                {isUnconfirmedBracelet && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: "#D97706" }}>pricing TBC</span>
                )}
              </button>
            </div>
            {isUnconfirmedBracelet && (
              <p style={{ fontSize: 12, color: "#D97706", marginTop: 8 }}>
                Bracelet pricing is not yet confirmed — prices shown are placeholders. Do not quote a customer until confirmed.
              </p>
            )}
          </div>

          {/* Metal colour */}
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Metal</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setMetalColour("yellow")} style={btn(metalColour === "yellow")}>
                Yellow Gold {config?.metal_surcharge_yellow != null ? `+$${Number(config.metal_surcharge_yellow).toFixed(0)}` : ""}
              </button>
              <button onClick={() => setMetalColour("white")} style={btn(metalColour === "white")}>
                White Gold {config?.metal_surcharge_white != null ? `+$${Number(config.metal_surcharge_white).toFixed(0)}` : ""}
              </button>
            </div>
          </div>

          {/* Pendant slots */}
          <div style={{ ...card, marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Pendant Slots ({slots.length})
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {slots.length > 2 && (
                  <button onClick={removeSlot} style={{ ...btn(false), padding: "4px 10px", fontSize: 12 }}>− Remove</button>
                )}
                {slots.length < 6 && (
                  <button onClick={addSlot} style={{ ...btn(true), padding: "4px 10px", fontSize: 12 }}>+ Add Slot</button>
                )}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {slots.map((slot, i) => (
                <div key={i} onClick={() => { setActiveSlot(i); }} style={slotCard(!!slot, activeSlot === i)}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "#9CA3AF" }}>Slot {i + 1}</div>
                  {slot ? (
                    <>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "#111827" }}>{slot.name}</div>
                      <div style={{ fontSize: 12, color: "#635BFF", fontWeight: 600 }}>${slot.price.toFixed(0)}</div>
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: "#9CA3AF" }}>
                      {activeSlot === i ? "↓ Pick below" : "Tap to select"}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pendant picker */}
          {activeSlot !== null && <PendantPicker />}
        </div>

        {/* ── Right: live price summary ───────────────────────────── */}
        <div style={{ flex: "0 0 240px", ...card, position: "sticky", top: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#111827", marginBottom: 14 }}>Price Summary</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 13, color: "#374151" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Base price</span>
              <span>${Number(config?.base_price ?? 0).toFixed(0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{slots.length} pendant slots</span>
              <span>${slotFee.toFixed(0)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>{metalColour === "yellow" ? "Yellow" : "White"} Gold</span>
              <span>${metalSurcharge.toFixed(0)}</span>
            </div>
          </div>

          {slots.some(s => s) && (
            <>
              <div style={{ height: 1, background: "#E8E8F0", margin: "10px 0" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
                {slots.map((s, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", color: s ? "#374151" : "#D1D5DB" }}>
                    <span>{s ? s.name : `Slot ${i + 1} (empty)`}</span>
                    <span>{s ? `$${s.price.toFixed(0)}` : "—"}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <div style={{ height: 1, background: "#E8E8F0", margin: "12px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, color: "#111827" }}>
            <span>Total</span>
            <span>${total.toFixed(0)}</span>
          </div>

          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            style={{
              marginTop: 14, width: "100%", padding: "10px 0",
              borderRadius: 8, border: "none", fontSize: 14, fontWeight: 600,
              background: canSave && !saving ? "#635BFF" : "#E5E7EB",
              color: canSave && !saving ? "#fff" : "#9CA3AF",
              cursor: canSave && !saving ? "pointer" : "not-allowed",
            }}
          >
            {saving ? "Saving…" : !allFilled ? "Fill all slots to save" : "Save Build"}
          </button>

          {!allFilled && (
            <p style={{ fontSize: 11, color: "#9CA3AF", marginTop: 6, textAlign: "center" }}>
              {slots.filter(s => s === null).length} slot{slots.filter(s => s === null).length !== 1 ? "s" : ""} still empty
            </p>
          )}
        </div>
      </div>
    );
  }

  // ── Render: Mode 2 — Add to Existing
  function ModeAftermarket() {
    return (
      <div style={{ maxWidth: 540 }}>
        {/* Fork selector */}
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
            What does the customer need?
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => { setAfterMode("adding"); setWorkshopSent(false); }}
              style={{
                ...btn(afterMode === "adding"),
                textAlign: "left",
                padding: "12px 16px",
              }}
            >
              <div style={{ fontWeight: 600 }}>Adding a new charm</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Attaching a new pendant to an existing piece</div>
            </button>
            <button
              onClick={() => { setAfterMode("repositioning"); setWorkshopSent(false); setWorkshopError(null); }}
              style={{
                ...btn(afterMode === "repositioning"),
                textAlign: "left",
                padding: "12px 16px",
              }}
            >
              <div style={{ fontWeight: 600 }}>Repositioning existing charms</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 2 }}>Moving a charm already on the piece to a different position</div>
            </button>
          </div>
        </div>

        {/* Adding a new charm */}
        {afterMode === "adding" && (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
              Charm Details
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Metal</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setAfterMetal("yellow")} style={btn(afterMetal === "yellow")}>Yellow Gold</button>
                <button onClick={() => setAfterMetal("white")}  style={btn(afterMetal === "white")}>White Gold</button>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: "#374151", marginBottom: 6 }}>Charm Type</div>
              <select
                value={afterCharmType}
                onChange={e => setAfterCharmType(e.target.value)}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: "1px solid #D1D5DB", fontSize: 13 }}
              >
                {CHARM_TYPE_ORDER.map(ct => (
                  <option key={ct} value={ct}>{CHARM_TYPE_LABELS[ct]}</option>
                ))}
              </select>
            </div>

            {afterRate ? (
              <div style={{ background: "#F5F3FF", border: "1.5px solid #635BFF", borderRadius: 8, padding: "14px 16px" }}>
                <div style={{ fontSize: 12, color: "#6B7280", marginBottom: 2 }}>Total price (incl. $40 soldering)</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: "#635BFF" }}>${Number(afterRate.total_price).toFixed(0)}</div>
              </div>
            ) : (
              <div style={{ fontSize: 13, color: "#9CA3AF" }}>Rate not available for this combination.</div>
            )}
          </div>
        )}

        {/* Repositioning */}
        {afterMode === "repositioning" && (
          <div style={card}>
            <div style={{
              background: "#FFFBEB",
              border: "1px solid #FDE68A",
              borderRadius: 8,
              padding: "14px 16px",
              marginBottom: 16,
            }}>
              <div style={{ fontWeight: 600, color: "#92400E", fontSize: 14, marginBottom: 6 }}>
                Send to Workshop for Quote
              </div>
              <p style={{ fontSize: 13, color: "#92400E", margin: 0, lineHeight: 1.5 }}>
                Repositioning existing charms requires additional soldering work that cannot be priced through the standard charm builder. This job needs a manual quote from the workshop.
              </p>
            </div>

            {workshopSent ? (
              <div style={{ fontSize: 13, color: "#059669", fontWeight: 500 }}>
                ✓ Workshop job created — the team will provide a manual quote.
              </div>
            ) : (
              <>
                <button
                  onClick={handleSendToWorkshop}
                  style={{ ...btn(true, "#059669"), width: "100%", padding: "10px 0" }}
                >
                  Create Workshop Job
                </button>
                {workshopError && (
                  <p style={{ fontSize: 12, color: "#DC2626", marginTop: 8 }}>{workshopError}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Render: page shell
  return (
    <div style={{ padding: "24px 28px", maxWidth: 1100 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#111827", margin: 0, marginBottom: 6 }}>
        Charm Builder
      </h1>
      <p style={{ fontSize: 13, color: "#6B7280", margin: 0, marginBottom: 20 }}>
        Price personalised charm necklaces for in-store customers.
      </p>

      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, border: "1px solid #E8E8F0", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
        {([
          { key: "build",        label: "New Build" },
          { key: "aftermarket",  label: "Add to Existing Piece" },
        ] as { key: AppMode; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setAppMode(key)}
            style={{
              padding: "9px 20px",
              fontSize: 13,
              fontWeight: appMode === key ? 600 : 400,
              background: appMode === key ? "#635BFF" : "#fff",
              color: appMode === key ? "#fff" : "#374151",
              border: "none",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {appMode === "build" ? <ModeBuild /> : <ModeAftermarket />}
    </div>
  );
}
