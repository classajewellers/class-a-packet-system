"use client";

export const dynamic = "force-dynamic";

import { Suspense, useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";

// ─── Types ───────────────────────────────────────────────────────────────────

type Settings = {
  ownership_label_yes: string;
  ownership_label_no: string;
  ownership_label_unknown: string;
  labour_rate_per_minute: number;
  labour_increment_minutes: number;
};
type RepairAction = {
  id: string; name: string; pricing_mode: string;
  default_price: number | null; default_minutes: number | null; hint: string | null;
};
type ServiceAction = {
  id: string; name: string; pricing_mode: string;
  default_price: number | null; default_minutes: number | null; hint: string | null;
};
type Part = {
  id: string; product_code: string | null; category: string; material: string;
  name: string; size: string | null; cost: number; fittable: boolean; is_estimated: boolean;
};
type PricingBracket = { id: string; bracket_type: string; cost_lower_bound: number; multiplier: number | null };
type DiscountTier = { id: string; name: string; discount_percent: number; eligible_ownership_only: boolean };
type FittingFeeConfig = { fee_per_end: number };
type CatalogueData = {
  settings: Settings;
  repairActions: RepairAction[];
  serviceActions: ServiceAction[];
  parts: Part[];
  brackets: PricingBracket[];
  discountTiers: DiscountTier[];
  fittingFeeConfig: FittingFeeConfig;
};

type QuoteLine = {
  id: string; line_type: string; catalogue_ref_id: string | null;
  description: string; quantity: number; cost: number | null; retail_price: number; is_poa: boolean;
};

type PendingInput = {
  actionId: string; name: string;
  mode: "minutes" | "manual" | "description_labour";
  minutes: number; description: string; manualPrice: string;
} | null;

type QuoteItem = {
  id: string; description: string; ownership_status: string; condition_notes: string;
  lines: QuoteLine[]; showPicker: boolean;
  pickerTab: "repairs" | "services" | "parts";
  pickerSearch: string; pickerCategory: string;
  pendingInput: PendingInput;
};

type Customer = { firstName: string; lastName: string; email: string; phone: string };

// ─── Helpers ─────────────────────────────────────────────────────────────────

function applyBracket(cost: number, brackets: PricingBracket[], bracketType: string): number | null {
  const matching = brackets
    .filter(b => b.bracket_type === bracketType && Number(b.cost_lower_bound) <= cost)
    .sort((a, b) => Number(b.cost_lower_bound) - Number(a.cost_lower_bound));
  if (!matching.length) return cost;
  const m = matching[0].multiplier;
  return m === null ? null : cost * Number(m);
}

function newItem(): QuoteItem {
  return {
    id: crypto.randomUUID(), description: "", ownership_status: "unknown", condition_notes: "",
    lines: [], showPicker: false, pickerTab: "repairs",
    pickerSearch: "", pickerCategory: "", pendingInput: null,
  };
}

function fmtPrice(p: number): string {
  return `$${p.toFixed(2)}`;
}

function itemSubtotal(item: QuoteItem): number {
  return item.lines.filter(l => !l.is_poa).reduce((sum, l) => sum + Number(l.retail_price) * Number(l.quantity), 0);
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid #E8E8F0", borderRadius: 8,
  padding: "8px 12px", fontSize: 14, color: "#1A1A2E", outline: "none",
  background: "#fff", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
  display: "block", fontSize: 12, fontWeight: 600, color: "#6B7280",
  marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em",
};
const cardStyle: React.CSSProperties = {
  background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12,
  padding: "20px 24px", marginBottom: 16,
};

// ─── ItemCard ────────────────────────────────────────────────────────────────

type ItemCardProps = {
  item: QuoteItem; idx: number; catalogue: CatalogueData | null; isManager: boolean;
  ownershipOptions: { value: string; label: string }[];
  onUpdate: (changes: Partial<QuoteItem>) => void;
  onAddRepairLine: (action: RepairAction) => void;
  onAddServiceLine: (action: ServiceAction) => void;
  onConfirmPending: (lineType: "repair_action" | "service") => void;
  onAddPart: (part: Part) => void;
  onRemoveLine: (lineId: string) => void;
  onUpdateLine: (lineId: string, changes: Partial<QuoteLine>) => void;
  onRemoveItem?: () => void;
};

function ItemCard({
  item, idx, catalogue, isManager, ownershipOptions,
  onUpdate, onAddRepairLine, onAddServiceLine, onConfirmPending,
  onAddPart, onRemoveLine, onUpdateLine, onRemoveItem,
}: ItemCardProps) {
  const s = catalogue?.settings;

  // ── Filtered parts ──
  const categories = catalogue
    ? Array.from(new Set(catalogue.parts.map(p => p.category))).sort()
    : [];
  const filteredParts = catalogue
    ? catalogue.parts.filter(p =>
        (!item.pickerCategory || p.category === item.pickerCategory) &&
        (!item.pickerSearch || `${p.name} ${p.material} ${p.size ?? ""} ${p.category}`.toLowerCase().includes(item.pickerSearch.toLowerCase()))
      )
    : [];

  function renderRepairOrServiceActions(actions: (RepairAction | ServiceAction)[], lineType: "repair_action" | "service") {
    if (!actions.length) return <div style={{ color: "#6B7280", fontSize: 13, padding: "20px 0", textAlign: "center" }}>No actions configured.</div>;

    return (
      <div>
        {actions.map(action => {
          const isGuided = action.pricing_mode === "guided";
          const isPending = item.pendingInput?.actionId === action.id;

          return (
            <div key={action.id}>
              <div
                onClick={() => !isGuided && (lineType === "repair_action" ? onAddRepairLine(action as RepairAction) : onAddServiceLine(action as ServiceAction))}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "10px 12px", borderRadius: 8, cursor: isGuided ? "default" : "pointer",
                  background: isPending ? "#F0F0FF" : "transparent",
                  border: isPending ? "1px solid #635BFF" : "1px solid transparent",
                  marginBottom: 2,
                  opacity: isGuided ? 0.55 : 1,
                }}
                onMouseEnter={e => { if (!isGuided && !isPending) e.currentTarget.style.background = "#F9FAFB"; }}
                onMouseLeave={e => { if (!isPending) e.currentTarget.style.background = "transparent"; }}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>{action.name}</div>
                  {action.hint && <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{action.hint}</div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 12 }}>
                  {isGuided && <span style={{ fontSize: 11, background: "#F3F4F6", color: "#9CA3AF", borderRadius: 4, padding: "2px 7px", fontWeight: 600 }}>Phase 2</span>}
                  {action.pricing_mode === "flat" && action.default_price != null && <span style={{ fontSize: 13, color: "#635BFF", fontWeight: 600 }}>{fmtPrice(Number(action.default_price))}</span>}
                  {!isGuided && <span style={{ fontSize: 18, color: "#635BFF", lineHeight: 1 }}>+</span>}
                </div>
              </div>

              {/* Pending input panel for this action */}
              {isPending && item.pendingInput && (
                <div style={{ background: "#F0F0FF", border: "1px solid #635BFF", borderRadius: 8, padding: "14px 14px 12px", marginBottom: 8 }}>
                  {item.pendingInput.mode === "description_labour" && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Description</label>
                      <input
                        autoFocus
                        value={item.pendingInput.description}
                        onChange={e => onUpdate({ pendingInput: { ...item.pendingInput!, description: e.target.value } })}
                        placeholder="e.g. Ring shank"
                        style={inputStyle}
                      />
                    </div>
                  )}
                  {(item.pendingInput.mode === "minutes" || item.pendingInput.mode === "description_labour") && s && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Minutes</label>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                          onClick={() => onUpdate({ pendingInput: { ...item.pendingInput!, minutes: Math.max(Number(s.labour_increment_minutes), item.pendingInput!.minutes - Number(s.labour_increment_minutes)) } })}
                          style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #E8E8F0", background: "#fff", fontSize: 18, cursor: "pointer", flexShrink: 0 }}
                        >−</button>
                        <span style={{ fontSize: 15, fontWeight: 600, minWidth: 40, textAlign: "center" }}>{item.pendingInput.minutes}</span>
                        <button
                          onClick={() => onUpdate({ pendingInput: { ...item.pendingInput!, minutes: item.pendingInput!.minutes + Number(s.labour_increment_minutes) } })}
                          style={{ width: 32, height: 32, borderRadius: 6, border: "1px solid #E8E8F0", background: "#fff", fontSize: 18, cursor: "pointer", flexShrink: 0 }}
                        >+</button>
                        {(() => {
                          const retail = applyBracket(item.pendingInput.minutes * Number(s.labour_rate_per_minute), catalogue!.brackets, "labour");
                          return <span style={{ fontSize: 13, color: retail === null ? "#DC2626" : "#635BFF", fontWeight: 600, marginLeft: 4 }}>{retail === null ? "POA" : fmtPrice(retail)}</span>;
                        })()}
                      </div>
                    </div>
                  )}
                  {item.pendingInput.mode === "manual" && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={labelStyle}>Price ($)</label>
                      <input
                        autoFocus
                        type="number" min="0" step="0.01"
                        value={item.pendingInput.manualPrice}
                        onChange={e => onUpdate({ pendingInput: { ...item.pendingInput!, manualPrice: e.target.value } })}
                        placeholder="0.00"
                        style={{ ...inputStyle, width: 140 }}
                      />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => onConfirmPending(lineType)}
                      style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 6, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                    >Add Line</button>
                    <button
                      onClick={() => onUpdate({ pendingInput: null })}
                      style={{ background: "transparent", color: "#6B7280", border: "1px solid #E8E8F0", borderRadius: 6, padding: "7px 14px", fontSize: 13, cursor: "pointer" }}
                    >Cancel</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      {/* Item header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.05em", paddingTop: 10, flexShrink: 0 }}>
          Item {idx + 1}
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}>
          <input
            value={item.description}
            onChange={e => onUpdate({ description: e.target.value })}
            placeholder="Item description (e.g. Yellow gold ring)"
            style={inputStyle}
          />
          {ownershipOptions.length > 0 && (
            <select
              value={item.ownership_status}
              onChange={e => onUpdate({ ownership_status: e.target.value })}
              style={{ ...inputStyle, width: "auto", appearance: "none" as any, paddingRight: 28, background: "#F9FAFB" }}
            >
              {ownershipOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
        </div>
        {onRemoveItem && (
          <button onClick={onRemoveItem} style={{ background: "none", border: "none", cursor: "pointer", color: "#9CA3AF", padding: "6px", flexShrink: 0 }} title="Remove item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        )}
      </div>
      <div style={{ marginBottom: 14 }}>
        <input
          value={item.condition_notes}
          onChange={e => onUpdate({ condition_notes: e.target.value })}
          placeholder="Condition notes (optional)"
          style={{ ...inputStyle, background: "#FAFAFA", fontSize: 13, color: "#6B7280" }}
        />
      </div>

      {/* Lines */}
      {item.lines.length > 0 && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 12 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #E8E8F0" }}>
              <th style={{ textAlign: "left", padding: "4px 8px 8px 0", color: "#9CA3AF", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>Description</th>
              {isManager && <th style={{ textAlign: "right", padding: "4px 8px 8px", color: "#9CA3AF", fontWeight: 600, fontSize: 11, textTransform: "uppercase", width: 70 }}>Cost</th>}
              <th style={{ textAlign: "center", padding: "4px 8px 8px", color: "#9CA3AF", fontWeight: 600, fontSize: 11, textTransform: "uppercase", width: 60 }}>Qty</th>
              <th style={{ textAlign: "right", padding: "4px 8px 8px", color: "#9CA3AF", fontWeight: 600, fontSize: 11, textTransform: "uppercase", width: 90 }}>Price</th>
              <th style={{ width: 28 }} />
            </tr>
          </thead>
          <tbody>
            {item.lines.map(line => (
              <tr key={line.id} style={{ borderBottom: "1px solid #F3F4F6" }}>
                <td style={{ padding: "8px 8px 8px 0", color: "#374151" }}>
                  {line.description}
                </td>
                {isManager && (
                  <td style={{ padding: "8px", textAlign: "right", color: "#9CA3AF" }}>
                    {line.cost != null ? fmtPrice(Number(line.cost)) : "—"}
                  </td>
                )}
                <td style={{ padding: "8px", textAlign: "center" }}>
                  {line.is_poa ? (
                    <span style={{ color: "#9CA3AF" }}>1</span>
                  ) : (
                    <input
                      type="number" min="1" step="1"
                      value={line.quantity}
                      onChange={e => onUpdateLine(line.id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                      style={{ ...inputStyle, width: 52, textAlign: "center", padding: "4px 6px", fontSize: 13 }}
                    />
                  )}
                </td>
                <td style={{ padding: "8px", textAlign: "right" }}>
                  {line.is_poa ? (
                    <span style={{ color: "#DC2626", fontWeight: 600, fontSize: 12 }}>POA</span>
                  ) : (
                    <input
                      type="number" min="0" step="0.01"
                      value={Number(line.retail_price).toFixed(2)}
                      onChange={e => onUpdateLine(line.id, { retail_price: parseFloat(e.target.value) || 0 })}
                      style={{ ...inputStyle, width: 80, textAlign: "right", padding: "4px 6px", fontSize: 13 }}
                    />
                  )}
                </td>
                <td style={{ padding: "4px 0 4px 4px" }}>
                  <button onClick={() => onRemoveLine(line.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#D1D5DB", padding: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {item.lines.filter(l => !l.is_poa).length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={isManager ? 5 : 4} style={{ textAlign: "right", padding: "10px 32px 4px 0", fontWeight: 700, fontSize: 14, color: "#1A1A2E" }}>
                  {fmtPrice(itemSubtotal(item))}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      )}

      {/* Add Line button */}
      <button
        onClick={() => onUpdate({ showPicker: !item.showPicker, pendingInput: null })}
        style={{
          background: item.showPicker ? "#F0F0FF" : "#F9FAFB",
          border: `1px solid ${item.showPicker ? "#635BFF" : "#E8E8F0"}`,
          borderRadius: 8, padding: "8px 16px", fontSize: 13,
          color: item.showPicker ? "#635BFF" : "#374151",
          cursor: "pointer", fontWeight: 500,
        }}
      >
        {item.showPicker ? "✕ Close picker" : "+ Add Line"}
      </button>

      {/* Catalogue picker */}
      {item.showPicker && catalogue && (
        <div style={{ marginTop: 14, border: "1px solid #E8E8F0", borderRadius: 10, overflow: "hidden" }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #E8E8F0", background: "#F9FAFB" }}>
            {(["repairs", "services", "parts"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => onUpdate({ pickerTab: tab, pendingInput: null })}
                style={{
                  flex: 1, padding: "11px 0", fontSize: 13, fontWeight: 600, border: "none",
                  background: item.pickerTab === tab ? "#fff" : "transparent",
                  color: item.pickerTab === tab ? "#635BFF" : "#6B7280",
                  cursor: "pointer",
                  borderBottom: item.pickerTab === tab ? "2px solid #635BFF" : "2px solid transparent",
                  textTransform: "capitalize",
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ maxHeight: 340, overflowY: "auto", padding: "12px 14px" }}>
            {item.pickerTab === "repairs" && renderRepairOrServiceActions(catalogue.repairActions, "repair_action")}

            {item.pickerTab === "services" && renderRepairOrServiceActions(catalogue.serviceActions, "service")}

            {item.pickerTab === "parts" && (
              <div>
                {/* Parts filter controls */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                  <input
                    value={item.pickerSearch}
                    onChange={e => onUpdate({ pickerSearch: e.target.value })}
                    placeholder="Search parts…"
                    style={{ ...inputStyle, fontSize: 13 }}
                  />
                  <select
                    value={item.pickerCategory}
                    onChange={e => onUpdate({ pickerCategory: e.target.value })}
                    style={{ ...inputStyle, fontSize: 13, appearance: "none" as any }}
                  >
                    <option value="">All categories</option>
                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
                {filteredParts.length === 0 && (
                  <div style={{ color: "#6B7280", fontSize: 13, textAlign: "center", padding: "16px 0" }}>No parts match.</div>
                )}
                {filteredParts.map(part => {
                  const retail = applyBracket(Number(part.cost), catalogue.brackets, "parts_metal");
                  return (
                    <div
                      key={part.id}
                      onClick={() => onAddPart(part)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 10px", borderRadius: 8, cursor: "pointer", marginBottom: 2 }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                    >
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 500, color: "#1A1A2E" }}>
                          {part.name}{part.size ? ` — ${part.size}` : ""}
                          {part.is_estimated && <span style={{ marginLeft: 6, fontSize: 10, background: "#FEF3C7", color: "#92400E", borderRadius: 4, padding: "2px 5px", fontWeight: 700 }}>EST.</span>}
                          {part.fittable && <span style={{ marginLeft: 6, fontSize: 10, background: "#EEF2FF", color: "#635BFF", borderRadius: 4, padding: "2px 5px", fontWeight: 700 }}>+FIT</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 1 }}>{part.category} · {part.material}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: retail === null ? "#DC2626" : "#635BFF" }}>
                          {retail === null ? "POA" : fmtPrice(retail)}
                        </div>
                        {isManager && <div style={{ fontSize: 11, color: "#9CA3AF" }}>cost {fmtPrice(Number(part.cost))}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main builder ────────────────────────────────────────────────────────────

function RepairQuoteBuilderInner() {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const isManager = canManage(user?.role);
  const headers = { "x-tenant-id": user?.tenantId ?? "" };

  const [catalogue, setCatalogue] = useState<CatalogueData | null>(null);
  const [customer, setCustomer] = useState<Customer>({ firstName: "", lastName: "", email: "", phone: "" });
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [items, setItems] = useState<QuoteItem[]>([newItem()]);
  const [discountTierId, setDiscountTierId] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!hydrated || !user?.tenantId) return;
    fetch("/api/quotes/repair/catalogue", { headers })
      .then(r => r.json())
      .then(data => setCatalogue(data));
  }, [hydrated, user?.tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (customerSearch.length < 2) { setCustomerResults([]); setShowCustomerDropdown(false); return; }
    if (customerTimerRef.current) clearTimeout(customerTimerRef.current);
    customerTimerRef.current = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(customerSearch)}`, { headers })
        .then(r => r.json())
        .then(data => { setCustomerResults(data.results ?? []); setShowCustomerDropdown(true); });
    }, 300);
  }, [customerSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!hydrated) return null;

  function updateItem(id: string, changes: Partial<QuoteItem>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...changes } : it));
  }

  function addLine(itemId: string, line: Omit<QuoteLine, "id">) {
    setItems(prev => prev.map(it =>
      it.id === itemId
        ? { ...it, lines: [...it.lines, { ...line, id: crypto.randomUUID() }], pendingInput: null }
        : it
    ));
  }

  function removeLine(itemId: string, lineId: string) {
    setItems(prev => prev.map(it =>
      it.id === itemId ? { ...it, lines: it.lines.filter(l => l.id !== lineId) } : it
    ));
  }

  function updateLine(itemId: string, lineId: string, changes: Partial<QuoteLine>) {
    setItems(prev => prev.map(it =>
      it.id === itemId
        ? { ...it, lines: it.lines.map(l => l.id === lineId ? { ...l, ...changes } : l) }
        : it
    ));
  }

  function addRepairOrServiceLine(item: QuoteItem, action: RepairAction | ServiceAction, lineType: "repair_action" | "service") {
    if (!catalogue || action.pricing_mode === "guided") return;
    if (action.pricing_mode === "flat") {
      addLine(item.id, {
        line_type: lineType, catalogue_ref_id: action.id, description: action.name,
        quantity: 1, cost: null, retail_price: Number(action.default_price ?? 0), is_poa: false,
      });
      return;
    }
    const incr = Number(catalogue.settings.labour_increment_minutes);
    updateItem(item.id, {
      pendingInput: {
        actionId: action.id, name: action.name,
        mode: action.pricing_mode as "minutes" | "manual" | "description_labour",
        minutes: Number(action.default_minutes ?? incr),
        description: "", manualPrice: "",
      },
    });
  }

  function confirmPendingLine(item: QuoteItem, lineType: "repair_action" | "service") {
    const p = item.pendingInput;
    if (!p || !catalogue) return;
    const s = catalogue.settings;

    if (p.mode === "minutes" || p.mode === "description_labour") {
      const retail = applyBracket(p.minutes * Number(s.labour_rate_per_minute), catalogue.brackets, "labour");
      const desc = p.mode === "description_labour" && p.description ? `${p.name} — ${p.description}` : p.name;
      addLine(item.id, {
        line_type: lineType, catalogue_ref_id: p.actionId, description: desc,
        quantity: 1, cost: null, retail_price: retail ?? 0, is_poa: retail === null,
      });
    } else {
      addLine(item.id, {
        line_type: lineType, catalogue_ref_id: p.actionId, description: p.name,
        quantity: 1, cost: null, retail_price: parseFloat(p.manualPrice) || 0, is_poa: false,
      });
    }
  }

  function addPartLine(item: QuoteItem, part: Part) {
    if (!catalogue) return;
    const cost = Number(part.cost);
    const retail = applyBracket(cost, catalogue.brackets, "parts_metal");
    const desc = part.is_estimated
      ? `${part.name}${part.size ? ` (${part.size})` : ""} — Est. cost, confirm before quoting`
      : `${part.name}${part.size ? ` (${part.size})` : ""}`;
    addLine(item.id, {
      line_type: "part", catalogue_ref_id: part.id, description: desc,
      quantity: 1, cost: isManager ? cost : null, retail_price: retail ?? 0, is_poa: retail === null,
    });
    if (part.fittable) {
      const fee = Number(catalogue.fittingFeeConfig.fee_per_end);
      addLine(item.id, {
        line_type: "part", catalogue_ref_id: null, description: "Fitting fee",
        quantity: 1, cost: null, retail_price: fee, is_poa: false,
      });
    }
  }

  function calcTotals() {
    const tier = catalogue?.discountTiers.find(t => t.id === discountTierId);
    const subtotal = items.reduce((s, it) => s + itemSubtotal(it), 0);
    let discountAmount = 0;
    if (tier) {
      const discountable = items.reduce((s, it) => {
        if (tier.eligible_ownership_only && it.ownership_status !== "purchased_from_us") return s;
        return s + itemSubtotal(it);
      }, 0);
      discountAmount = discountable * (Number(tier.discount_percent) / 100);
    }
    return { subtotal, discountAmount, total: subtotal - discountAmount };
  }

  async function handleSave() {
    const validItems = items.filter(it => it.description.trim());
    if (!validItems.length) { setSaveError("Add at least one item with a description."); return; }
    setSaving(true);
    setSaveError("");
    const { discountAmount } = calcTotals();
    try {
      const res = await fetch("/api/quotes/repair", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          customer: customer.firstName || customer.email ? customer : null,
          items: validItems,
          discountTierId: discountTierId || null,
          discountAmount: discountAmount || null,
        }),
      });
      const data = await res.json();
      if (data.error) { setSaveError(data.error); setSaving(false); return; }
      router.push(`/quotes/${data.quote.id}`);
    } catch {
      setSaveError("An error occurred. Please try again.");
      setSaving(false);
    }
  }

  const { subtotal, discountAmount, total } = calcTotals();
  const selectedTier = catalogue?.discountTiers.find(t => t.id === discountTierId);
  const settings = catalogue?.settings;

  const ownershipOptions = settings ? [
    { value: "purchased_from_us", label: settings.ownership_label_yes },
    { value: "not_purchased_from_us", label: settings.ownership_label_no },
    { value: "unknown", label: settings.ownership_label_unknown },
  ] : [];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <Link href="/quotes/builder" style={{ color: "#6B7280", textDecoration: "none", fontSize: 14, display: "flex", alignItems: "center", gap: 4 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Build Quote
        </Link>
        <span style={{ color: "#D1D5DB" }}>/</span>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1A2E", margin: 0 }}>Repair Quote</h1>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 24, alignItems: "start" }}>
        {/* ── Left column ── */}
        <div>
          {/* Customer */}
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>Customer</div>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                placeholder="Search by name or email…"
                value={customerSearch}
                onChange={e => setCustomerSearch(e.target.value)}
                onFocus={() => customerResults.length > 0 && setShowCustomerDropdown(true)}
                onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                style={inputStyle}
              />
              {showCustomerDropdown && customerResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #E8E8F0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 50, maxHeight: 200, overflowY: "auto", marginTop: 4 }}>
                  {customerResults.map((r: any, i: number) => (
                    <div
                      key={i}
                      onMouseDown={() => {
                        setCustomer({ firstName: r.first_name ?? "", lastName: r.last_name ?? "", email: r.email ?? "", phone: r.phone ?? "" });
                        setCustomerSearch(`${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || r.email);
                        setShowCustomerDropdown(false);
                      }}
                      style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14, borderBottom: "1px solid #F3F4F6" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F9FAFB")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                    >
                      <div style={{ fontWeight: 600, color: "#1A1A2E" }}>{r.first_name} {r.last_name}</div>
                      <div style={{ color: "#6B7280", fontSize: 12 }}>{r.email}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={labelStyle}>First name</label>
                <input value={customer.firstName} onChange={e => setCustomer(c => ({ ...c, firstName: e.target.value }))} style={inputStyle} placeholder="First" />
              </div>
              <div>
                <label style={labelStyle}>Last name</label>
                <input value={customer.lastName} onChange={e => setCustomer(c => ({ ...c, lastName: e.target.value }))} style={inputStyle} placeholder="Last" />
              </div>
              <div>
                <label style={labelStyle}>Email</label>
                <input value={customer.email} onChange={e => setCustomer(c => ({ ...c, email: e.target.value }))} style={inputStyle} placeholder="email@example.com" type="email" />
              </div>
              <div>
                <label style={labelStyle}>Phone</label>
                <input value={customer.phone} onChange={e => setCustomer(c => ({ ...c, phone: e.target.value }))} style={inputStyle} placeholder="04xx xxx xxx" />
              </div>
            </div>
          </div>

          {/* Items */}
          {items.map((item, idx) => (
            <ItemCard
              key={item.id}
              item={item} idx={idx} catalogue={catalogue} isManager={isManager}
              ownershipOptions={ownershipOptions}
              onUpdate={changes => updateItem(item.id, changes)}
              onAddRepairLine={action => addRepairOrServiceLine(item, action, "repair_action")}
              onAddServiceLine={action => addRepairOrServiceLine(item, action, "service")}
              onConfirmPending={lineType => confirmPendingLine(item, lineType)}
              onAddPart={part => addPartLine(item, part)}
              onRemoveLine={lineId => removeLine(item.id, lineId)}
              onUpdateLine={(lineId, changes) => updateLine(item.id, lineId, changes)}
              onRemoveItem={items.length > 1 ? () => setItems(prev => prev.filter(it => it.id !== item.id)) : undefined}
            />
          ))}

          <button
            onClick={() => setItems(prev => [...prev, newItem()])}
            style={{ background: "transparent", border: "2px dashed #D1D5DB", borderRadius: 10, padding: "12px 20px", fontSize: 14, color: "#6B7280", cursor: "pointer", width: "100%", marginBottom: 8 }}
          >
            + Add Another Item
          </button>
        </div>

        {/* ── Right sidebar ── */}
        <div style={{ position: "sticky", top: 24 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1A1A2E", marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quote Summary</div>

            {items.filter(it => it.description).map(it => (
              <div key={it.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#374151" }}>
                <span style={{ maxWidth: 195, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.description}</span>
                <span style={{ fontWeight: 500, flexShrink: 0, marginLeft: 8 }}>{fmtPrice(itemSubtotal(it))}</span>
              </div>
            ))}

            <div style={{ borderTop: "1px solid #E8E8F0", margin: "14px 0 10px" }} />

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 12, color: "#374151" }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 600 }}>{fmtPrice(subtotal)}</span>
            </div>

            {catalogue && catalogue.discountTiers.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>Discount</label>
                <select
                  value={discountTierId}
                  onChange={e => setDiscountTierId(e.target.value)}
                  style={{ ...inputStyle, appearance: "none" as any, marginBottom: selectedTier ? 8 : 0 }}
                >
                  <option value="">No discount</option>
                  {catalogue.discountTiers.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.discount_percent}%){t.eligible_ownership_only ? " — owned items only" : ""}
                    </option>
                  ))}
                </select>
                {selectedTier && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#059669" }}>
                    <span>{selectedTier.name}</span>
                    <span>−{fmtPrice(discountAmount)}</span>
                  </div>
                )}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, fontWeight: 700, color: "#1A1A2E", borderTop: "2px solid #E8E8F0", paddingTop: 12, marginBottom: 20 }}>
              <span>Total</span>
              <span style={{ color: "#635BFF" }}>{fmtPrice(total)}</span>
            </div>

            {saveError && <div style={{ fontSize: 13, color: "#DC2626", marginBottom: 12 }}>{saveError}</div>}

            <button
              onClick={handleSave}
              disabled={saving}
              style={{ width: "100%", background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "13px 0", fontSize: 15, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

export default function RepairQuoteBuilderPage() {
  return (
    <Suspense fallback={null}>
      <RepairQuoteBuilderInner />
    </Suspense>
  );
}
