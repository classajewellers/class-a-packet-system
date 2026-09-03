"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { InventoryPiece, InventoryReferenceData } from "@/lib/types";
// calculateLivePricing removed — pricing now uses calculate_price() RPC via /api/inventory/pieces/[id]/price
import InventoryAttachmentsPanel from "@/components/InventoryAttachmentsPanel";
import StatusBadge, { StatusTone } from "@/components/StatusBadge";
import { color, radius, shadow } from "@/lib/theme";
import {
  ArrowLeft, Edit2, Save, X, ArrowRight,
  Lock, AlertTriangle, TrendingDown, Package, MapPin, Clock, DollarSign, Bookmark, BookmarkX,
  Wifi, WifiOff, Printer, RefreshCw,
} from "lucide-react";

const PAYMENT_METHODS = ["Cash", "EFTPOS", "Credit Card", "Bank Transfer", "Layby", "Finance", "Other"];

/** Map a free-text status name to a StatusBadge tone (visual only). */
function statusTone(name?: string | null): StatusTone {
  const n = (name ?? "").toLowerCase();
  if (n.includes("in stock") || n.includes("in-stock") || n.includes("available") || n.includes("active")) return "success";
  if (n.includes("reserved") || n.includes("low") || n.includes("pending") || n.includes("hold") || n.includes("layby")) return "warning";
  if (n.includes("sold") || n.includes("out") || n.includes("overdue") || n.includes("lost")) return "danger";
  if (n.includes("transfer") || n.includes("workshop") || n.includes("repair")) return "info";
  return "neutral";
}

/** Build "Grandparent › Parent › Leaf" path by climbing parent_id links. */
function buildLocationPath(
  locationId: string | null | undefined,
  locations: Array<{ id: string; name: string; parent_id?: string | null }>,
  fallback?: string
): string {
  if (!locationId) return fallback ?? "";
  const byId = new Map(locations.map(l => [l.id, l]));
  const parts: string[] = [];
  let cur = byId.get(locationId);
  let safety = 0;
  while (cur && safety++ < 10) {
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.length ? parts.join(" › ") : (fallback ?? "");
}

type Params = { params: { id: string } };

// ── Formatters ───────────────────────────────────────────────────────────────

const fmtMoney = (n: number | null | undefined) =>
  n != null ? `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";
const fmtPct = (n: number | null | undefined) =>
  n != null ? `${Number(n).toFixed(1)}%` : "—";
function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

// ── Shared micro-components ──────────────────────────────────────────────────

function FieldView({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 14, color: value != null && value !== "" ? color.ink : "#D1D5DB" }}>
        {value != null && value !== "" ? String(value) : "—"}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, marginBottom: 16, boxShadow: shadow.card }}>
      <h3 style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>{children}</div>
    </div>
  );
}

function GpChip({ gp, pct }: { gp: number | null; pct: number | null }) {
  if (gp == null) return <span style={{ color: color.textFaint, fontSize: 13 }}>—</span>;
  const pctVal = pct ?? 0;
  const colour = pctVal >= 40 ? "#10B981" : pctVal >= 20 ? "#F59E0B" : "#EF4444";
  return (
    <span style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: colour }}>
      {fmtMoney(gp)} <span style={{ fontSize: 12, fontWeight: 400 }}>({fmtPct(pct)})</span>
    </span>
  );
}

function PricingLineItem({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", fontSize: 13 }}>
      <span style={{ color: color.textMuted }}>
        {label}{sub && <span style={{ color: color.textFaint, marginLeft: 4, fontSize: 12 }}>{sub}</span>}
      </span>
      <span style={{ fontFamily: "monospace", fontWeight: 500, color: color.textMuted }}>{value}</span>
    </div>
  );
}

// ── Timeline ─────────────────────────────────────────────────────────────────

type TLEventType = "created" | "received" | "movement" | "sold";
type TLEvent = {
  id: string;
  type: TLEventType;
  label: string;
  by?: string | null;
  at: Date;
  notes?: string | null;
};

const TL_COLOUR: Record<TLEventType, string> = {
  created:  "#10B981",
  received: "#3B82F6",
  movement: color.ink,
  sold:     "#F59E0B",
};

function buildTimeline(piece: any, movements: any[]): TLEvent[] {
  const events: TLEvent[] = [];

  if (piece.created_at) {
    events.push({ id: "created", type: "created", label: "Added to inventory", at: new Date(piece.created_at) });
  }

  if (piece.date_received) {
    events.push({ id: "received", type: "received", label: "Received into stock", at: new Date(piece.date_received) });
  }

  for (const m of movements) {
    const parts: string[] = [];
    if (m.to_location?.name) {
      if (m.from_location?.name && m.from_location.name !== m.to_location.name) {
        parts.push(`${m.from_location.name} → ${m.to_location.name}`);
      } else if (!m.from_location?.name) {
        parts.push(`Moved to ${m.to_location.name}`);
      }
    }
    if (m.to_status?.name) {
      if (m.from_status?.name && m.from_status.name !== m.to_status.name) {
        parts.push(`${m.from_status.name} → ${m.to_status.name}`);
      } else if (!m.from_status?.name) {
        parts.push(`Status: ${m.to_status.name}`);
      }
    }
    events.push({
      id: m.id,
      type: "movement",
      label: parts.join("  ·  ") || "Movement recorded",
      by: m.moved_by,
      at: new Date(m.moved_at),
      notes: m.notes,
    });
  }

  if (piece.date_sold) {
    events.push({ id: "sold", type: "sold", label: "Sold", at: new Date(piece.date_sold) });
  }

  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function Timeline({ piece, movements }: { piece: any; movements: any[] }) {
  const events = buildTimeline(piece, movements);

  if (events.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: color.textFaint }}>No history recorded yet.</p>;
  }

  return (
    <div>
      {events.map((ev, i) => {
        const colour = TL_COLOUR[ev.type];
        const isLast = i === events.length - 1;
        return (
          <div key={ev.id} style={{ display: "flex", gap: 12 }}>
            {/* Dot + connector */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
              <div style={{ width: 11, height: 11, borderRadius: "50%", background: colour, flexShrink: 0, marginTop: 3 }} />
              {!isLast && (
                <div style={{ width: 2, flex: 1, minHeight: 18, background: color.line, margin: "4px 0" }} />
              )}
            </div>
            {/* Content */}
            <div style={{ paddingBottom: isLast ? 0 : 18, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: color.ink, lineHeight: 1.4 }}>{ev.label}</div>
              {ev.notes && <div style={{ fontSize: 12, color: color.textMuted, marginTop: 2 }}>{ev.notes}</div>}
              <div style={{ fontSize: 11, color: color.textFaint, marginTop: 3 }}>
                {ev.by ? `${ev.by}  ·  ` : ""}{fmtDate(ev.at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── RFID Panel ───────────────────────────────────────────────────────────────

function RfidPanel({ pieceId, tenantId, isManager }: { pieceId: string; tenantId: string; isManager: boolean }) {
  const [rfidState, setRfidState]     = useState<{ active_tag: any; printed_tag: any; active_job: any; recent_job: any } | null>(null);
  const [printing, setPrinting]       = useState(false);
  const [confirming, setConfirming]   = useState(false);
  const [actionError, setActionError] = useState("");
  const [pollTimer, setPollTimer]     = useState<ReturnType<typeof setInterval> | null>(null);

  const fetchRfid = useCallback(async () => {
    if (!tenantId) return null;
    const res = await fetch(`/api/rfid/pieces/${pieceId}`, {
      headers: { "x-tenant-id": tenantId },
    });
    if (res.ok) {
      const data = await res.json();
      setRfidState(data);
      return data;
    }
    return null;
  }, [pieceId, tenantId]);

  useEffect(() => { fetchRfid(); }, [fetchRfid]);

  // Poll while a job is in-flight
  useEffect(() => {
    if (rfidState?.active_job) {
      if (!pollTimer) {
        const t = setInterval(async () => {
          const data = await fetchRfid();
          if (!data?.active_job) {
            clearInterval(t);
            setPollTimer(null);
            setPrinting(false);
          }
        }, 2500);
        setPollTimer(t);
      }
    } else {
      if (pollTimer) { clearInterval(pollTimer); setPollTimer(null); }
    }
    return () => { if (pollTimer) clearInterval(pollTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfidState?.active_job]);

  const handlePrint = async (replace = false) => {
    setPrinting(true);
    setActionError("");
    try {
      const res = await fetch("/api/rfid/print", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ piece_id: pieceId, replace }),
      });
      const data = await res.json();
      if (!res.ok) { setActionError(data.error ?? "Print request failed"); setPrinting(false); return; }
      await fetchRfid();
    } catch {
      setActionError("Network error — is your bridge running?");
      setPrinting(false);
    }
  };

  const [epcInput, setEpcInput]   = useState("");
  const [epcError, setEpcError]   = useState("");

  const handleConfirm = async () => {
    const normalised = epcInput.trim().toLowerCase();
    if (!/^[0-9a-f]{24}$/.test(normalised)) {
      setEpcError("EPC must be exactly 24 hex characters (e.g. a3f1c2d4e5b6a7c8d9e0f1a2)");
      return;
    }
    setConfirming(true);
    setActionError("");
    setEpcError("");
    try {
      const res = await fetch(`/api/rfid/pieces/${pieceId}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
        body: JSON.stringify({ confirmed_epc: normalised, verification_method: "uhf_reader_manual" }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "epc_mismatch") {
          setEpcError(`EPC mismatch. Expected: ${data.expected_epc}. Got: ${data.confirmed_epc}`);
        } else {
          setActionError(data.error ?? "Verification failed");
        }
        setConfirming(false);
        return;
      }
      setEpcInput("");
      await fetchRfid();
    } catch {
      setActionError("Network error during verification");
    } finally {
      setConfirming(false);
    }
  };

  const activeTag  = rfidState?.active_tag;
  const printedTag = rfidState?.printed_tag;
  const activeJob  = rfidState?.active_job;
  const recentJob  = rfidState?.recent_job;
  const lastFailed = !activeTag && !printedTag && !activeJob && recentJob?.status === "failed";

  return (
    <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, marginBottom: 16, boxShadow: shadow.card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {activeTag
          ? <Wifi size={13} style={{ color: "#10B981" }} />
          : <WifiOff size={13} style={{ color: color.textFaint }} />}
        <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
          RFID Tag
        </h3>
        {activeJob && (
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#F59E0B" }}>
            <RefreshCw size={10} style={{ animation: "spin 1s linear infinite" }} />
            {activeJob.status === "queued" ? "Waiting for bridge…" : activeJob.status === "claimed" ? "Bridge claimed…" : "Sending to printer…"}
          </span>
        )}
      </div>

      {/* Active (verified) tag */}
      {activeTag && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: radius.pill, background: "#D1FAE5", color: "#065F46", fontSize: 11, fontWeight: 600, marginBottom: 6 }}>
            <Wifi size={9} /> Verified active
          </span>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: color.textMuted, letterSpacing: "0.04em", wordBreak: "break-all" as const, marginTop: 6 }}>
            EPC: {activeTag.epc}
          </div>
          {activeTag.activated_at && (
            <div style={{ fontSize: 11, color: color.textFaint, marginTop: 3 }}>Verified {fmtDate(activeTag.activated_at)}</div>
          )}
        </div>
      )}

      {/* Printed (awaiting physical verification via UHF reader) */}
      {!activeTag && printedTag && !activeJob && (
        <div style={{ marginBottom: 12 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: radius.pill, background: "#FEF3C7", color: "#92400E", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>
            Sent to printer — awaiting verification
          </span>
          <div style={{ fontSize: 12, color: color.textMuted, marginBottom: 4 }}>Expected EPC:</div>
          <div style={{ fontFamily: "monospace", fontSize: 12, color: color.textMuted, letterSpacing: "0.04em", wordBreak: "break-all" as const, marginBottom: 10 }}>
            {printedTag.epc}
          </div>
          <p style={{ margin: "0 0 10px", fontSize: 12, color: color.textMuted, lineHeight: 1.5 }}>
            Read the physical tag with a <strong>UHF EPC Gen2 reader</strong> (e.g. AZH-P1). Enter the observed EPC below to verify it matches.
            If no reader is available yet, leave the tag in this state — do not confirm without reading.
          </p>
          {isManager && (
            <div>
              <input
                value={epcInput}
                onChange={e => { setEpcInput(e.target.value); setEpcError(""); }}
                placeholder="Enter 24-char EPC from UHF reader…"
                maxLength={32}
                style={{
                  width: "100%", boxSizing: "border-box" as const,
                  padding: "8px 10px", borderRadius: radius.md, fontSize: 12, fontFamily: "monospace",
                  border: epcError ? "1px solid #FCA5A5" : "1px solid #D1D5DB",
                  outline: "none", marginBottom: epcError ? 4 : 0,
                }}
              />
              {epcError && <p style={{ margin: "0 0 6px", fontSize: 11, color: "#DC2626" }}>{epcError}</p>}
            </div>
          )}
        </div>
      )}

      {/* No tag and no in-flight job */}
      {!activeTag && !printedTag && !activeJob && (
        <div style={{ marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: color.textFaint }}>
            {lastFailed ? "Last print job failed." : "No RFID tag encoded for this piece."}
          </p>
          {lastFailed && recentJob?.last_error && (
            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#DC2626" }}>{recentJob.last_error}</p>
          )}
        </div>
      )}

      {actionError && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#DC2626" }}>{actionError}</p>
      )}

      {isManager && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
          {/* Print: available when no active/printed tag and no job in flight */}
          {!activeTag && !printedTag && !activeJob && (
            <button onClick={() => handlePrint(false)} disabled={printing}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: radius.pill, border: "1px solid #D1D5DB", background: printing ? color.fill : color.white, color: printing ? color.textFaint : color.ink, fontSize: 13, cursor: printing ? "not-allowed" : "pointer", fontWeight: 500 }}>
              <Printer size={13} />
              {printing ? "Sending…" : "Print RFID Tag"}
            </button>
          )}

          {/* Confirm: available once printed and 24-char EPC entered */}
          {printedTag && !activeJob && (
            <button
              onClick={handleConfirm}
              disabled={confirming || !/^[0-9a-f]{24}$/i.test(epcInput.trim())}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 14px", borderRadius: radius.pill, border: "none",
                background: !/^[0-9a-f]{24}$/i.test(epcInput.trim()) ? color.line : confirming ? "#D1FAE5" : "#10B981",
                color: !/^[0-9a-f]{24}$/i.test(epcInput.trim()) ? color.textFaint : color.white,
                fontSize: 13,
                cursor: (confirming || !/^[0-9a-f]{24}$/i.test(epcInput.trim())) ? "not-allowed" : "pointer",
                fontWeight: 500,
              }}>
              {confirming ? "Verifying…" : "Verify EPC Match"}
            </button>
          )}

          {/* Replace: available only when an active (verified) tag exists */}
          {activeTag && !activeJob && (
            <button onClick={() => handlePrint(true)} disabled={printing}
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: radius.pill, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 13, cursor: printing ? "not-allowed" : "pointer" }}>
              <Printer size={13} />
              Replace Tag
            </button>
          )}

          <button onClick={fetchRfid}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: `1px solid ${color.line}`, background: color.paper, color: color.textMuted, fontSize: 13, cursor: "pointer" }}>
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Edit-field context ────────────────────────────────────────────────────────
// EF must live outside the page component so React sees a stable identity across
// re-renders. Defining it inside causes remount on every keystroke (focus lost).

interface EditCtx {
  editing: boolean;
  piece: InventoryPiece | null;
  form: Partial<InventoryPiece>;
  setForm: React.Dispatch<React.SetStateAction<Partial<InventoryPiece>>>;
}
const EditContext = createContext<EditCtx>({
  editing: false, piece: null, form: {}, setForm: () => {},
});

function EF({ label, field, type = "text", opts }: {
  label: string;
  field: keyof InventoryPiece;
  type?: string;
  opts?: { value: string; label: string }[];
}) {
  const { editing, piece, form, setForm } = useContext(EditContext);
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: color.textFaint, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 3, display: "block" };
  const inputStyle: React.CSSProperties = { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 };
  const value = editing ? (form[field] ?? "") : (piece?.[field] ?? "");
  const onChange = (val: string) => setForm(f => ({ ...f, [field]: val === "" ? null : val }));

  if (!editing) return <FieldView label={label} value={piece?.[field] as any} />;
  if (opts) {
    return (
      <div>
        <div style={labelStyle}>{label}</div>
        <select value={String(value)} onChange={e => onChange(e.target.value)}
          style={{ ...inputStyle, background: color.white }}>
          <option value="">—</option>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }
  return (
    <div>
      <div style={labelStyle}>{label}</div>
      <input type={type} value={String(value)} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InventoryItemPage({ params }: Params) {
  const router = useRouter();
  const { user, hydrated } = useUser();
  const tenantId: string = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [piece, setPiece]     = useState<InventoryPiece | null>(null);
  const [ref, setRef]         = useState<InventoryReferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState<Partial<InventoryPiece>>({});
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const [priceCalc, setPriceCalc]           = useState<any>(null);
  const [priceCalcError, setPriceCalcError] = useState<string>("");
  const [updatingSuggested, setUpdatingSuggested] = useState(false);

  const [showMove, setShowMove]     = useState(false);
  const [moveForm, setMoveForm]     = useState({ to_location_id: "", to_status_id: "", notes: "" });
  const [moveSaving, setMoveSaving] = useState(false);
  const [moveError, setMoveError]   = useState("");

  const [movements, setMovements] = useState<any[]>([]);

  const [products, setProducts]           = useState<any[]>([]);
  const [linkEditing, setLinkEditing]     = useState(false);
  const [linkProductId, setLinkProductId] = useState("");
  const [linkSaving, setLinkSaving]       = useState(false);
  const [linkError, setLinkError]         = useState("");

  // ── Paired piece ──────────────────────────────────────────────────────────────
  const [pairedPiece, setPairedPiece]       = useState<{ id: string; sku: string; title: string | null; retail_price: number | null; is_sold: boolean } | null>(null);
  const [pairEditing, setPairEditing]       = useState(false);
  const [pairSearch, setPairSearch]         = useState("");
  const [pairResults, setPairResults]       = useState<{ id: string; sku: string; title: string | null }[]>([]);
  const [pairDropdown, setPairDropdown]     = useState(false);
  const [pairSelected, setPairSelected]     = useState<{ id: string; sku: string; title: string | null; retail_price?: number | null; is_sold?: boolean } | null>(null);
  const [pairSaving, setPairSaving]         = useState(false);
  const [pairError, setPairError]           = useState("");
  const [sellAsPair, setSellAsPair]         = useState(false);

  // ── Staff list for Mark as Sold modal ────────────────────────────────────────
  const [staffList, setStaffList] = useState<{ id: string; full_name: string }[]>([]);

  // ── Mark as Sold ─────────────────────────────────────────────────────────────
  const [showSell, setShowSell]   = useState(false);
  const [sellForm, setSellForm]   = useState({
    sold_price: "",
    discount_amount: "",
    payment_method: "",
    staff_id: "",
    customer_id: "",
    notes: "",
  });
  const [sellSaving, setSellSaving]   = useState(false);
  const [sellError, setSellError]     = useState("");
  const [sellSuccess, setSellSuccess] = useState<{ id: string; gross_profit: number | null; note: string | null; paired_sku?: string | null } | null>(null);
  // Customer search state
  const [custSearch, setCustSearch]           = useState("");
  const [custResults, setCustResults]         = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null }[]>([]);
  const [custDropdown, setCustDropdown]       = useState(false);
  const [custDisplay, setCustDisplay]         = useState("");

  // ── Reservations ─────────────────────────────────────────────────────────────
  type Reservation = {
    id: string; status: string; reason: string | null; expires_at: string | null;
    quote_reference: string | null; order_reference: string | null;
    created_at: string; released_at: string | null; release_reason: string | null;
    customer: { id: string; first_name: string | null; last_name: string | null; email: string | null } | null;
    created_by_profile: { id: string; full_name: string } | null;
    previous_status: { id: string; name: string; colour: string } | null;
  };
  const [reservations, setReservations]   = useState<Reservation[]>([]);
  const [activeRes, setActiveRes]         = useState<Reservation | null>(null);
  const [showReserve, setShowReserve]     = useState(false);
  const [reserveForm, setReserveForm]     = useState({ reason: "", expires_at: "", quote_reference: "", order_reference: "" });
  const [resCustId, setResCustId]         = useState("");
  const [resCustDisplay, setResCustDisplay] = useState("");
  const [resCustSearch, setResCustSearch] = useState("");
  const [resCustResults, setResCustResults] = useState<{ id: string; first_name: string | null; last_name: string | null; email: string | null }[]>([]);
  const [resCustDropdown, setResCustDropdown] = useState(false);
  const [resSaving, setResSaving]         = useState(false);
  const [resError, setResError]           = useState("");
  const [showRelease, setShowRelease]     = useState(false);
  const [releaseReason, setReleaseReason] = useState("");
  const [relSaving, setRelSaving]         = useState(false);
  const [relError, setRelError]           = useState("");

  const headers = { "x-tenant-id": tenantId };

  const fetchAll = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    const [pieceRes, refRes, movRes, calcRes, prodRes, staffRes, resRes] = await Promise.all([
      fetch(`/api/inventory/pieces/${params.id}`, { headers }),
      fetch("/api/inventory/reference", { headers }),
      fetch(`/api/inventory/movements?piece_id=${params.id}&limit=50`, { headers }),
      fetch(`/api/inventory/pieces/${params.id}/price`, { headers }),
      fetch("/api/inventory/products", { headers }),
      fetch("/api/settings/users/list", { headers }),
      fetch(`/api/inventory/reservations?piece_id=${params.id}`, { headers }),
    ]);
    if (!pieceRes.ok) { setLoading(false); return; }
    const [pieceJson, refJson, movJson] = await Promise.all([
      pieceRes.json(), refRes.json(), movRes.json(),
    ]);
    setPiece(pieceJson.piece);
    setRef(refJson);
    setMovements(movJson.movements ?? []);
    if (calcRes.ok) {
      const cj = await calcRes.json();
      if (cj.calc?.error) {
        setPriceCalcError(cj.calc.error);
        setPriceCalc(null);
      } else {
        setPriceCalc(cj.calc ?? null);
        setPriceCalcError("");
      }
    }
    if (prodRes.ok) setProducts((await prodRes.json()).products ?? []);
    if (staffRes.ok) setStaffList((await staffRes.json()).users ?? []);
    if (resRes.ok) {
      const rj = await resRes.json();
      const all: Reservation[] = rj.reservations ?? [];
      setReservations(all);
      setActiveRes(all.find(r => r.status === "active") ?? null);
    }
    setLoading(false);
  }, [tenantId, params.id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function roundUpToNine(n: number): number {
    // Always round UP to the next number ending in 9 (e.g. $6,434.50 → $6,439)
    return Math.ceil((n - 9) / 10) * 10 + 9;
  }

  function priceCalcIsComplete(): boolean {
    // A calc is only usable for auto-fill when both metal and labour are non-zero.
    // Zero metal_retail means gram_weight was never entered; zero labour_retail means
    // labour_cost is missing. Either produces a dangerously incomplete suggested price.
    if (!priceCalc) return false;
    if (!(priceCalc.inputs?.gram_weight > 0)) return false;
    if (!(priceCalc.metal_retail > 0)) return false;
    return true;
  }

  function startEdit() {
    if (!piece) return;
    const base = { ...piece };
    // Auto-suggest retail price only when the calc is complete (metal + labour both present)
    if (base.retail_price == null && priceCalcIsComplete()) {
      base.retail_price = roundUpToNine(priceCalc.total_retail) as any;
    }
    setForm(base);
    setEditing(true);
    setError("");
  }

  async function applyRoundedSuggested() {
    if (!piece || !priceCalc?.total_retail) return;
    const rounded = roundUpToNine(priceCalc.total_retail);
    setUpdatingSuggested(true);
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ retail_price: rounded }),
    });
    const json = await res.json();
    setUpdatingSuggested(false);
    if (res.ok) setPiece(json.piece);
  }

  async function handleSave() {
    if (!piece) return;
    setSaving(true);
    setError("");
    const { status: _s, location: _l, category: _c, supplier: _sp, ...payload } = form as any;
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) { setError(json.error ?? "Save failed"); setSaving(false); return; }
    setPiece(json.piece);
    setEditing(false);
    setSaving(false);
  }

  async function handleMove() {
    if (!piece) return;
    if (!moveForm.to_location_id && !moveForm.to_status_id) {
      setMoveError("Select a new location or status");
      return;
    }
    setMoveSaving(true);
    setMoveError("");
    const res = await fetch("/api/inventory/movements", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ piece_id: piece.id, ...moveForm }),
    });
    const json = await res.json();
    if (!res.ok) { setMoveError(json.error ?? "Failed"); setMoveSaving(false); return; }
    setMoveSaving(false);
    setShowMove(false);
    setMoveForm({ to_location_id: "", to_status_id: "", notes: "" });
    fetchAll();
  }

  async function handleDelete() {
    if (!piece) return;
    if (!confirm(`Delete ${piece.sku}? This cannot be undone.`)) return;
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, { method: "DELETE", headers });
    if (res.ok) router.push("/inventory");
  }

  async function handleSaveLink() {
    if (!piece) return;
    setLinkSaving(true);
    setLinkError("");
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ product_id: linkProductId || null }),
    });
    const json = await res.json();
    setLinkSaving(false);
    if (!res.ok) { setLinkError(json.error ?? "Save failed"); return; }
    setPiece(json.piece);
    setLinkEditing(false);
  }

  // ── Paired piece: load on piece change ───────────────────────────────────────
  useEffect(() => {
    if (!piece || !tenantId) return;
    const ownId: string | null = (piece as any).paired_piece_id ?? null;
    const toPairedPiece = (p: any) => ({
      id: p.id,
      sku: p.sku,
      title: p.title,
      retail_price: p.retail_price != null ? Number(p.retail_price) : null,
      is_sold: (p.status?.name ?? "").toLowerCase().includes("sold"),
    });
    if (ownId) {
      fetch(`/api/inventory/pieces/${ownId}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.piece) setPairedPiece(toPairedPiece(json.piece)); })
        .catch(() => {});
    } else {
      // Check back-reference: another piece pointing at this one
      fetch(`/api/inventory/pieces?paired_to=${params.id}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(json => {
          const match = (json?.pieces ?? [])[0] ?? null;
          setPairedPiece(match ? toPairedPiece(match) : null);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [piece?.id, tenantId]);

  // ── Paired piece: type-ahead SKU search ──────────────────────────────────────
  useEffect(() => {
    if (pairSearch.length < 2) { setPairResults([]); setPairDropdown(false); return; }
    const t = setTimeout(() => {
      fetch(`/api/inventory/pieces?search=${encodeURIComponent(pairSearch)}&per_page=20`, { headers })
        .then(r => r.json())
        .then(json => {
          const results = (json.pieces ?? [])
            .filter((p: any) => p.id !== params.id)
            .map((p: any) => ({ id: p.id, sku: p.sku, title: p.title }));
          setPairResults(results);
          setPairDropdown(results.length > 0);
        })
        .catch(() => setPairResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [pairSearch, tenantId]);

  async function handleSavePair() {
    if (!piece) return;
    setPairSaving(true);
    setPairError("");
    const newPairId = pairSelected?.id ?? null;
    const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ paired_piece_id: newPairId }),
    });
    const json = await res.json();
    setPairSaving(false);
    if (!res.ok) { setPairError(json.error ?? "Save failed"); return; }
    setPiece(json.piece);
    // Re-fetch the paired piece to get full data including retail_price and status
    if (pairSelected?.id) {
      fetch(`/api/inventory/pieces/${pairSelected.id}`, { headers })
        .then(r => r.ok ? r.json() : null)
        .then(json => { if (json?.piece) setPairedPiece({ id: json.piece.id, sku: json.piece.sku, title: json.piece.title, retail_price: json.piece.retail_price != null ? Number(json.piece.retail_price) : null, is_sold: (json.piece.status?.name ?? "").toLowerCase().includes("sold") }); })
        .catch(() => {});
    } else {
      setPairedPiece(null);
    }
    setPairEditing(false);
    setPairSearch("");
    setPairSelected(null);
    setPairDropdown(false);
  }

  // ── Customer search for sell modal ──────────────────────────────────────────
  useEffect(() => {
    if (custSearch.length < 2) { setCustResults([]); setCustDropdown(false); return; }
    const t = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(custSearch)}`, { headers })
        .then(r => r.json())
        .then(json => {
          setCustResults(json.results ?? []);
          setCustDropdown((json.results ?? []).length > 0);
        })
        .catch(() => setCustResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch, tenantId]);

  function selectCustomer(c: { id: string; first_name: string | null; last_name: string | null; email: string | null }) {
    setSellForm(f => ({ ...f, customer_id: c.id }));
    setCustDisplay(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || c.id);
    setCustSearch("");
    setCustDropdown(false);
  }

  async function handleSell() {
    if (!piece) return;
    const totalPrice = parseFloat(sellForm.sold_price);
    if (!sellForm.sold_price || isNaN(totalPrice) || totalPrice <= 0) {
      setSellError("Sold price is required and must be greater than zero");
      return;
    }
    setSellSaving(true);
    setSellError("");

    const commonPayload = {
      discount_amount: parseFloat(sellForm.discount_amount || "0") || 0,
      staff_id:        sellForm.staff_id   || null,
      customer_id:     sellForm.customer_id || null,
      payment_method:  sellForm.payment_method || null,
      notes:           sellForm.notes      || null,
      moved_by:        user?.name          || null,
    };

    if (sellAsPair && pairedPiece && !pairedPiece.is_sold) {
      // Split the total price proportionally by each piece's retail price.
      // If either retail is unknown, split 50/50.
      const r1 = Number(piece.retail_price ?? 0);
      const r2 = Number(pairedPiece.retail_price ?? 0);
      const combined = r1 + r2;
      const price1 = combined > 0
        ? Math.round((totalPrice * (r1 / combined)) * 100) / 100
        : Math.round((totalPrice / 2) * 100) / 100;
      const price2 = Math.round((totalPrice - price1) * 100) / 100;

      const [res1, res2] = await Promise.all([
        fetch("/api/inventory/sales", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ piece_id: piece.id, sold_price: price1, ...commonPayload }),
        }),
        fetch("/api/inventory/sales", {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ piece_id: pairedPiece.id, sold_price: price2, ...commonPayload }),
        }),
      ]);

      const [json1, json2] = await Promise.all([res1.json(), res2.json()]);
      setSellSaving(false);

      if (!res1.ok) { setSellError(json1.error ?? "Failed to record sale for this piece"); return; }
      if (!res2.ok) { setSellError(`${piece.sku} sold but failed for ${pairedPiece.sku}: ${json2.error ?? "unknown error"}`); fetchAll(); return; }

      const combinedGP = (json1.gross_profit != null && json2.gross_profit != null)
        ? json1.gross_profit + json2.gross_profit
        : (json1.gross_profit ?? json2.gross_profit ?? null);

      setSellSuccess({
        id: json1.sale?.id ?? "",
        gross_profit: combinedGP,
        note: (json1.gross_profit == null || json2.gross_profit == null)
          ? "Gross profit partial — one or both pieces missing cost data"
          : null,
        paired_sku: pairedPiece.sku,
      });
    } else {
      const res = await fetch("/api/inventory/sales", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ piece_id: piece.id, sold_price: totalPrice, ...commonPayload }),
      });
      const json = await res.json();
      setSellSaving(false);
      if (!res.ok) { setSellError(json.error ?? "Failed to record sale"); return; }
      setSellSuccess({
        id: json.sale?.id ?? "",
        gross_profit: json.gross_profit,
        note: json.gross_profit_note ?? null,
      });
    }
    fetchAll();
  }

  function openSellModal() {
    setSellAsPair(false);
    setSellForm({
      sold_price: piece?.retail_price != null ? String(piece.retail_price) : "",
      discount_amount: "",
      payment_method: "",
      staff_id: user?.id ?? "",
      customer_id: "",
      notes: "",
    });
    setCustDisplay("");
    setCustSearch("");
    setCustResults([]);
    setSellError("");
    setSellSuccess(null);
    setShowSell(true);
  }

  // ── Reservation customer search ──────────────────────────────────────────────
  useEffect(() => {
    if (resCustSearch.length < 2) { setResCustResults([]); setResCustDropdown(false); return; }
    const t = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(resCustSearch)}`, { headers })
        .then(r => r.json())
        .then(json => { setResCustResults(json.results ?? []); setResCustDropdown((json.results ?? []).length > 0); })
        .catch(() => setResCustResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [resCustSearch, tenantId]);

  function selectResCust(c: { id: string; first_name: string | null; last_name: string | null; email: string | null }) {
    setResCustId(c.id);
    setResCustDisplay(`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.email || c.id);
    setResCustSearch("");
    setResCustDropdown(false);
  }

  async function handleReserve() {
    if (!piece) return;
    setResSaving(true);
    setResError("");
    const res = await fetch("/api/inventory/reservations", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        piece_id:        piece.id,
        customer_id:     resCustId || null,
        reason:          reserveForm.reason || null,
        quote_reference: reserveForm.quote_reference || null,
        order_reference: reserveForm.order_reference || null,
        expires_at:      reserveForm.expires_at || null,
        created_by:      user?.id ?? null,
        moved_by:        user?.name ?? null,
      }),
    });
    const json = await res.json();
    setResSaving(false);
    if (!res.ok) { setResError(json.error ?? "Failed to create reservation"); return; }
    setShowReserve(false);
    setReserveForm({ reason: "", expires_at: "", quote_reference: "", order_reference: "" });
    setResCustId(""); setResCustDisplay(""); setResCustSearch("");
    fetchAll();
  }

  async function handleRelease() {
    if (!activeRes) return;
    setRelSaving(true);
    setRelError("");
    const res = await fetch(`/api/inventory/reservations/${activeRes.id}/release`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ release_reason: releaseReason || null, moved_by: user?.name ?? null }),
    });
    const json = await res.json();
    setRelSaving(false);
    if (!res.ok) { setRelError(json.error ?? "Failed to release"); return; }
    setShowRelease(false);
    setReleaseReason("");
    fetchAll();
  }

  // ── Guard ─────────────────────────────────────────────────────────────────

  if (!hydrated || loading) {
    return <div style={{ padding: 48, textAlign: "center", color: color.textFaint, fontSize: 14 }}>Loading…</div>;
  }
  if (!piece) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <p style={{ color: color.textMuted }}>Item not found.</p>
        <button onClick={() => router.push("/inventory")}
          style={{ marginTop: 12, padding: "8px 16px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, cursor: "pointer", fontSize: 14 }}>
          Back to Stock
        </button>
      </div>
    );
  }

  const lockedGP = piece.retail_price != null && piece.locked_cost != null
    ? Number(piece.retail_price) - Number(piece.locked_cost) : null;
  const lockedGPPct = lockedGP != null && piece.retail_price != null && Number(piece.retail_price) > 0
    ? (lockedGP / Number(piece.retail_price)) * 100 : null;
  const underpriced = priceCalc?.total_retail != null && piece.retail_price != null
    && Number(piece.retail_price) < priceCalc.total_retail * 0.9;
  const linkedProduct = products.find((p: any) => p.id === piece.product_id);
  const meleeQty = (piece as any).melee_quantity;

  // Determine sold / reserved state from current status name (case-insensitive)
  const isSold     = (piece.status?.name ?? "").toLowerCase().includes("sold");
  const isReserved = activeRes?.status === "active";
  const resExpired = isReserved && activeRes?.expires_at != null && new Date(activeRes.expires_at) < new Date();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <EditContext.Provider value={{ editing, piece, form, setForm }}>
    <div style={{ padding: "32px 32px 64px", maxWidth: 1100, margin: "0 auto" }}>

      {/* Back */}
      <button onClick={() => router.push("/inventory")}
        style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: color.textMuted, fontSize: 14, marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={16} /> Stock
      </button>

      {/* ── Header strip ── */}
      <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: "16px 24px", marginBottom: 20, boxShadow: shadow.card, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontFamily: "monospace", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink, flexShrink: 0 }}>{piece.sku}</span>
          {piece.status && (
            <StatusBadge tone={statusTone(piece.status.name)} label={piece.status.name} style={{ flexShrink: 0 }} />
          )}
          {piece.location && (
            <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, color: color.textMuted, flexShrink: 0 }}>
              <MapPin size={13} />
              {buildLocationPath(piece.location?.id, ref?.locations ?? [], piece.location.name)}
            </span>
          )}
          {piece.title && <span style={{ fontSize: 15, color: color.textMuted }}>{piece.title}</span>}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          {piece.retail_price != null && (
            <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: color.ink }}>
              {fmtMoney(piece.retail_price)}
            </span>
          )}
          {isManager && !editing && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Reserved badge or Reserve/Move buttons */}
              {isReserved ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 8, background: resExpired ? "#FEF2F2" : "#FFF7ED", border: `1px solid ${resExpired ? "#FECACA" : "#FED7AA"}`, fontSize: 12, fontWeight: 600, color: resExpired ? "#DC2626" : "#C2410C" }}>
                    <Bookmark size={12} />
                    {resExpired ? "Reservation Expired" : "Reserved"}
                    {activeRes?.customer && (
                      <span style={{ fontWeight: 400, marginLeft: 2 }}>
                        — {`${activeRes.customer.first_name ?? ""} ${activeRes.customer.last_name ?? ""}`.trim() || activeRes.customer.email}
                      </span>
                    )}
                  </span>
                  <button onClick={() => { setReleaseReason(""); setRelError(""); setShowRelease(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 12px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 12, cursor: "pointer", color: color.textMuted }}>
                    <BookmarkX size={13} /> Release
                  </button>
                </div>
              ) : !isSold && (
                <>
                  <button onClick={() => setShowMove(true)}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 13, cursor: "pointer", color: color.textMuted, fontWeight: 500 }}>
                    <ArrowRight size={14} /> Move
                  </button>
                  <button onClick={() => { setReserveForm({ reason: "", expires_at: "", quote_reference: "", order_reference: "" }); setResCustId(""); setResCustDisplay(""); setResCustSearch(""); setResError(""); setShowReserve(true); }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 13, cursor: "pointer", color: color.textMuted, fontWeight: 500 }}>
                    <Bookmark size={14} /> Reserve
                  </button>
                </>
              )}
              {!isSold && (
                <button onClick={openSellModal}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: radius.pill, border: "none", background: "#10B981", color: color.white, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  <DollarSign size={14} /> Mark as Sold
                </button>
              )}
              <button onClick={startEdit}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: radius.pill, border: "none", background: color.ink, color: color.white, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                <Edit2 size={14} /> Edit
              </button>
            </div>
          )}
          {editing && (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditing(false)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 13, cursor: "pointer", color: color.textMuted }}>
                <X size={14} /> Cancel
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: radius.pill, border: "none", background: color.ink, color: color.white, fontSize: 13, fontWeight: 500, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}>
                <Save size={14} /> {saving ? "Saving…" : "Save"}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{error}</div>
      )}

      {/* ── Two-column layout ── */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)", gap: 20, alignItems: "start" }}>

        {/* ═══ LEFT: Detail sections ═══ */}
        <div>

          {/* Identity */}
          <SectionCard title="Identity">
            <EF label="SKU" field="sku" />
            <EF label="Title" field="title" />
            {editing
              ? <EF label="Category" field="category_id" opts={ref?.categories.map(c => ({ value: c.id, label: c.name })) ?? []} />
              : <FieldView label="Category" value={(piece as any).category?.name ?? null} />
            }
            <EF label="Collection" field="collection" />
          </SectionCard>

          {/* Product blueprint */}
          <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, marginBottom: 16, boxShadow: shadow.card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Product Blueprint</h3>
              {isManager && !linkEditing && (
                <button
                  onClick={() => { setLinkProductId(piece.product_id ?? ""); setLinkError(""); setLinkEditing(true); }}
                  style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${color.line}`, background: color.white, fontSize: 12, cursor: "pointer", color: color.textMuted }}>
                  {piece.product_id ? "Change" : "Link"}
                </button>
              )}
            </div>
            {!linkEditing ? (
              piece.product_id ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Package size={14} style={{ color: color.ink, flexShrink: 0 }} />
                  <button onClick={() => router.push(`/inventory/products/${piece.product_id}`)}
                    style={{ fontSize: 14, fontWeight: 600, color: color.ink, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" as const }}>
                    {linkedProduct?.name ?? piece.product_id}
                  </button>
                  {linkedProduct?.category?.name && (
                    <span style={{ fontSize: 12, color: color.textFaint }}>{(linkedProduct.category as any).name}</span>
                  )}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: color.textFaint }}>Not linked to a product blueprint</p>
              )
            ) : (
              <div>
                {linkError && <div style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{linkError}</div>}
                <select value={linkProductId} onChange={e => setLinkProductId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, background: color.white, marginBottom: 10 }}>
                  <option value="">— None —</option>
                  {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setLinkEditing(false)}
                    style={{ padding: "7px 14px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 13, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSaveLink} disabled={linkSaving}
                    style={{ padding: "7px 16px", borderRadius: radius.pill, border: "none", background: color.ink, color: color.white, fontSize: 13, fontWeight: 500, cursor: linkSaving ? "not-allowed" : "pointer", opacity: linkSaving ? 0.7 : 1 }}>
                    {linkSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Paired piece */}
          <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, marginBottom: 16, boxShadow: shadow.card }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Paired Piece</h3>
              {isManager && !pairEditing && (
                <button
                  onClick={() => { setPairSelected(pairedPiece); setPairSearch(""); setPairError(""); setPairEditing(true); }}
                  style={{ padding: "3px 10px", borderRadius: 6, border: `1px solid ${color.line}`, background: color.white, fontSize: 12, cursor: "pointer", color: color.textMuted }}>
                  {pairedPiece ? "Change" : "Link"}
                </button>
              )}
            </div>
            {!pairEditing ? (
              pairedPiece ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 13, color: color.textFaint }}>Paired with</span>
                  <button onClick={() => router.push(`/inventory/${pairedPiece.id}`)}
                    style={{ fontFamily: "monospace", fontSize: 14, fontWeight: 600, color: color.ink, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                    {pairedPiece.sku}
                  </button>
                  {pairedPiece.title && (
                    <span style={{ fontSize: 13, color: color.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{pairedPiece.title}</span>
                  )}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: color.textFaint }}>Not paired</p>
              )
            ) : (
              <div>
                {pairError && <div style={{ padding: "8px 12px", background: "#FEF2F2", color: "#DC2626", borderRadius: 6, fontSize: 12, marginBottom: 10 }}>{pairError}</div>}
                <div style={{ position: "relative" as const, marginBottom: 10 }}>
                  <input
                    value={pairSearch}
                    onChange={e => { setPairSearch(e.target.value); setPairSelected(null); }}
                    placeholder={pairSelected ? pairSelected.sku : "Type SKU to search…"}
                    style={{ width: "100%", boxSizing: "border-box" as const, padding: "8px 10px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                  />
                  {pairDropdown && (
                    <div style={{ position: "absolute" as const, top: "100%", left: 0, right: 0, background: color.white, border: `1px solid ${color.line}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 20, maxHeight: 200, overflowY: "auto" as const }}>
                      {pairResults.map(p => (
                        <button key={p.id}
                          onClick={() => { setPairSelected(p); setPairSearch(""); setPairDropdown(false); }}
                          style={{ width: "100%", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", textAlign: "left" as const, fontSize: 13, display: "flex", gap: 10, alignItems: "baseline" }}>
                          <span style={{ fontFamily: "monospace", fontWeight: 600, color: color.ink }}>{p.sku}</span>
                          {p.title && <span style={{ color: color.textFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.title}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {pairSelected && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 6, fontSize: 13, marginBottom: 10 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 600, color: "#15803D" }}>{pairSelected.sku}</span>
                    <button onClick={() => setPairSelected(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: color.textFaint, padding: 0 }}>✕</button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => { setPairEditing(false); setPairSearch(""); setPairSelected(null); setPairDropdown(false); }}
                    style={{ padding: "7px 14px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 13, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSavePair} disabled={pairSaving || !pairSelected}
                    style={{ padding: "7px 16px", borderRadius: radius.pill, border: "none", background: pairSelected ? color.ink : color.line, color: pairSelected ? color.white : color.textFaint, fontSize: 13, fontWeight: 500, cursor: (pairSaving || !pairSelected) ? "not-allowed" : "pointer", opacity: pairSaving ? 0.7 : 1 }}>
                    {pairSaving ? "Saving…" : "Save"}
                  </button>
                  {pairedPiece && (
                    <button
                      disabled={pairSaving}
                      onClick={async () => {
                        setPairSaving(true);
                        setPairError("");
                        const res = await fetch(`/api/inventory/pieces/${piece.id}`, {
                          method: "PATCH",
                          headers: { ...headers, "Content-Type": "application/json" },
                          body: JSON.stringify({ paired_piece_id: null }),
                        });
                        const json = await res.json();
                        setPairSaving(false);
                        if (!res.ok) { setPairError(json.error ?? "Save failed"); return; }
                        setPiece(json.piece);
                        setPairedPiece(null);
                        setPairEditing(false);
                        setPairSearch("");
                        setPairSelected(null);
                      }}
                      style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: radius.pill, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 13, cursor: pairSaving ? "not-allowed" : "pointer" }}>
                      Remove pairing
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Metal */}
          <SectionCard title="Metal">
            <EF label="Metal Type" field="metal_type" />
            <EF label="Karat" field="metal_karat" />
            <EF label="Colour" field="metal_colour" />
            <EF label="Weight (g)" field="metal_weight_grams" type="number" />
          </SectionCard>

          {/* Stone */}
          <SectionCard title="Stone">
            <EF label="Diamond Type" field="diamond_type" />
            <EF label="Carat" field="diamond_carat" type="number" />
            <EF label="Shape" field={"stone_shape" as keyof InventoryPiece} />
            <EF label="Colour" field="diamond_colour" />
            <EF label="Clarity" field="diamond_clarity" />
            <EF label="Certificate #" field={"certificate_number" as keyof InventoryPiece} />
          </SectionCard>

          {/* Dimensions */}
          <SectionCard title="Dimensions">
            <EF label="Finger Size" field="finger_size" />
            <EF label="Chain Length" field="chain_length" />
            <EF label="Dimensions" field="dimensions" />
          </SectionCard>

          {/* Melee */}
          {(editing || (meleeQty != null && meleeQty > 0)) && (
            <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, marginBottom: 16, boxShadow: shadow.card }}>
              <h3 style={{ margin: "0 0 14px", fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                Melee Stones
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px 20px" }}>
                <EF label="Quantity" field={"melee_quantity" as keyof InventoryPiece} type="number" />
                <EF label="ct / stone" field={"melee_carat_weight" as keyof InventoryPiece} type="number" />
                <EF label="Colour Group" field={"melee_colour_group" as keyof InventoryPiece}
                  opts={editing ? ["D-F","G-H","I-J","K-L","M-N"].map(g => ({ value: g, label: g })) : undefined} />
                <EF label="Clarity" field={"melee_clarity" as keyof InventoryPiece}
                  opts={editing ? ["VVS","VS","SI1","SI2","SI3","I1","I2","I3"].map(c => ({ value: c, label: c })) : undefined} />
                {!editing && meleeQty != null && (piece as any).melee_carat_weight != null && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 3 }}>Total Melee</div>
                    <div style={{ fontSize: 14, color: color.ink }}>
                      {(Number(meleeQty) * Number((piece as any).melee_carat_weight)).toFixed(3)}ct
                      <span style={{ color: color.textFaint, marginLeft: 6, fontSize: 13 }}>
                        ({meleeQty} × {(piece as any).melee_carat_weight}ct)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Pricing — manager only ── */}
          {isManager && (
            editing ? (
              <SectionCard title="Pricing & Certificate">
                <EF label="Locked cost" field="locked_cost" type="number" />
                <EF label="Stone cost" field="stone_cost" type="number" />
                <EF label="Labour cost" field="labour_cost" type="number" />
                <EF label="Retail Price" field="retail_price" type="number" />
                {editing && form.retail_price == null && priceCalc != null && !priceCalcIsComplete() && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#B45309" }}>
                    ⚠ Enter metal weight{!(priceCalc.inputs?.gram_weight > 0) ? " (gram weight missing)" : ""} for an accurate suggested price — auto-fill skipped.
                  </p>
                )}
                <EF label="Cost Price" field="cost_price" type="number" />
                <EF label="Certificate Number" field="valuation_number" />
                <EF label="Certificate Amount" field="valuation_amount" type="number" />
              </SectionCard>
            ) : (
              <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, marginBottom: 16, boxShadow: shadow.card }}>
                <h3 style={{ margin: "0 0 16px", fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Pricing</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

                  {/* Actual Cost */}
                  <div style={{ background: color.paper, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                      <Lock size={12} style={{ color: color.textMuted }} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: color.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Actual Cost</span>
                    </div>
                    {piece.locked_cost == null ? (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "8px 10px", background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 6 }}>
                        <AlertTriangle size={12} style={{ color: "#D97706", marginTop: 1, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "#92400E" }}>No locked cost recorded</span>
                      </div>
                    ) : (
                      <>
                        <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: color.ink }}>{fmtMoney(piece.locked_cost)}</div>
                        <div style={{ fontSize: 11, color: color.textFaint, marginTop: 2, marginBottom: 10 }}>Recorded at entry — never changes</div>
                        {lockedGP != null && (
                          <div>
                            <div style={{ fontSize: 11, color: color.textFaint, marginBottom: 3 }}>Locked GP</div>
                            <GpChip gp={lockedGP} pct={lockedGPPct} />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Live Pricing — driven by calculate_price() RPC */}
                  <div style={{ background: color.paper, border: `1px solid ${color.line}`, borderRadius: radius.md, padding: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: color.textMuted, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>Live Pricing</div>
                    {priceCalcError ? (
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6, padding: "8px 10px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6 }}>
                        <AlertTriangle size={12} style={{ color: "#DC2626", marginTop: 1, flexShrink: 0 }} />
                        <div>
                          <div style={{ fontSize: 12, color: "#DC2626", fontWeight: 500 }}>
                            {priceCalcError === "no_metal_rate"
                              ? "No metal rate found"
                              : priceCalcError === "piece_not_found"
                              ? "Piece not found in pricing engine"
                              : `Pricing error: ${priceCalcError}`}
                          </div>
                          {priceCalcError === "no_metal_rate" && (
                            <div style={{ fontSize: 11, color: "#92400E", marginTop: 2 }}>Add a rate in Settings → Pricing → Metal Prices</div>
                          )}
                        </div>
                      </div>
                    ) : priceCalc == null ? (
                      <div style={{ fontSize: 12, color: color.textFaint }}>No pricing data — set metal weight to calculate.</div>
                    ) : (
                      <>
                        <div style={{ borderBottom: `1px solid ${color.line}`, paddingBottom: 8, marginBottom: 8 }}>
                          <PricingLineItem label="Metal" value={fmtMoney(priceCalc.metal_retail)} />
                          {(priceCalc.stone_retail ?? 0) > 0 && (
                            <PricingLineItem label="Stone" value={fmtMoney(priceCalc.stone_retail)} />
                          )}
                          <PricingLineItem label="Labour" value={fmtMoney(priceCalc.labour_retail)} />
                          {(priceCalc.melee_retail ?? 0) > 0 && (
                            <PricingLineItem label="Melee" value={fmtMoney(priceCalc.melee_retail)} />
                          )}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, fontSize: 12, fontWeight: 700 }}>
                          <span style={{ color: color.textMuted }}>Suggested retail</span>
                          <span style={{ fontFamily: "monospace", fontSize: 14, color: color.ink }}>{fmtMoney(priceCalc.total_retail)}</span>
                        </div>
                        <PricingLineItem label="Actual retail" value={fmtMoney(piece.retail_price)} />
                        {underpriced && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 6, padding: "5px 8px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <TrendingDown size={12} style={{ color: "#DC2626" }} />
                              <span style={{ fontSize: 11, color: "#DC2626", fontWeight: 500 }}>Retail may be underpriced</span>
                            </div>
                            {!editing && isManager && (
                              <button
                                onClick={applyRoundedSuggested}
                                disabled={updatingSuggested}
                                style={{ fontSize: 11, fontWeight: 600, color: "#DC2626", background: "none", border: "1px solid #FECACA", borderRadius: 5, padding: "2px 8px", cursor: updatingSuggested ? "not-allowed" : "pointer", opacity: updatingSuggested ? 0.6 : 1, whiteSpace: "nowrap" }}
                              >
                                {updatingSuggested ? "Saving…" : `Update to ${fmtMoney(roundUpToNine(priceCalc.total_retail))}`}
                              </button>
                            )}
                          </div>
                        )}
                        {(() => {
                          const liveGP = piece.retail_price != null
                            ? Number(piece.retail_price) - priceCalc.total_retail : null;
                          const liveGPPct = liveGP != null && piece.retail_price != null && Number(piece.retail_price) > 0
                            ? (liveGP / Number(piece.retail_price)) * 100 : null;
                          return liveGP != null ? (
                            <div style={{ marginTop: 8, borderTop: `1px solid ${color.line}`, paddingTop: 8 }}>
                              <div style={{ fontSize: 11, color: color.textFaint, marginBottom: 3 }}>Live GP</div>
                              <GpChip gp={liveGP} pct={liveGPPct} />
                            </div>
                          ) : null;
                        })()}
                        {priceCalc.inputs && (
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${color.line}` }}>
                            <div style={{ fontSize: 10, color: color.textFaint, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", marginBottom: 4 }}>Inputs used</div>
                            <div style={{ fontSize: 11, color: color.textMuted, lineHeight: 1.7 }}>
                              {priceCalc.inputs.metal_type_key && (
                                <div>{priceCalc.inputs.metal_type_key} · {fmtMoney(priceCalc.inputs.gold_price_per_gram)}/g · {priceCalc.inputs.gram_weight}g</div>
                              )}
                              {priceCalc.inputs.metal_multiplier != null && (
                                <div>Metal ×{priceCalc.inputs.metal_multiplier} · Labour ×{priceCalc.inputs.labour_multiplier}</div>
                              )}
                              {priceCalc.inputs.stone_multiplier != null && (
                                <div>Stone ×{priceCalc.inputs.stone_multiplier} ({priceCalc.inputs.stone_origin})</div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Stored cost inputs — visible in view mode without editing */}
                {(piece.labour_cost != null || piece.stone_cost != null || (piece as any).actual_cost != null) && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${color.line}`, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px 20px" }}>
                    {piece.labour_cost != null && <FieldView label="Stored Labour Cost" value={fmtMoney(piece.labour_cost)} />}
                    {piece.stone_cost != null && <FieldView label="Stone Cost" value={fmtMoney(piece.stone_cost)} />}
                    {(piece as any).actual_cost != null && <FieldView label="Actual Cost Paid" value={fmtMoney((piece as any).actual_cost)} />}
                  </div>
                )}

                {(piece.valuation_number || piece.valuation_amount) && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${color.line}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px 20px" }}>
                    <FieldView label="Certificate Number" value={piece.valuation_number} />
                    <FieldView label="Certificate Amount" value={piece.valuation_amount} />
                  </div>
                )}
              </div>
            )
          )}

          {/* Inventory state */}
          <SectionCard title="Inventory">
            <EF label="Status" field="status_id" opts={ref?.statuses.map(s => ({ value: s.id, label: s.name })) ?? []} />
            <EF label="Location" field="location_id" opts={ref?.locations.map(l => ({ value: l.id, label: buildLocationPath(l.id, ref.locations, l.name) })) ?? []} />
            <EF label="Supplier" field="supplier_id" opts={ref?.suppliers.map(s => ({ value: s.id, label: s.name })) ?? []} />
            <EF label="Assigned To" field="assigned_to" />
          </SectionCard>

          {/* Active reservation card */}
          {isReserved && activeRes && (
            <div style={{ background: resExpired ? "#FEF2F2" : "#FFFBEB", border: `1px solid ${resExpired ? "#FECACA" : "#FDE68A"}`, borderRadius: radius.lg, padding: 20, marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Bookmark size={13} style={{ color: resExpired ? "#DC2626" : "#D97706" }} />
                <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: resExpired ? "#DC2626" : "#D97706", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                  {resExpired ? "Reservation Expired" : "Reserved"}
                </h3>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px" }}>
                <FieldView label="Customer" value={activeRes.customer ? `${activeRes.customer.first_name ?? ""} ${activeRes.customer.last_name ?? ""}`.trim() || activeRes.customer.email : null} />
                <FieldView label="Reserved By" value={activeRes.created_by_profile?.full_name} />
                <FieldView label="Reserved On" value={fmtDate(activeRes.created_at)} />
                {activeRes.expires_at && <FieldView label="Expires" value={fmtDate(activeRes.expires_at)} />}
                {activeRes.reason && <div style={{ gridColumn: "1 / -1" }}><FieldView label="Reason" value={activeRes.reason} /></div>}
                {activeRes.quote_reference && <FieldView label="Quote Ref" value={activeRes.quote_reference} />}
                {activeRes.order_reference && <FieldView label="Order Ref" value={activeRes.order_reference} />}
              </div>
            </div>
          )}

          {/* Dates */}
          <SectionCard title="Dates">
            <EF label="Date Received" field="date_received" type="date" />
            <EF label="Date Sold" field="date_sold" type="date" />
          </SectionCard>

          {/* Notes */}
          <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, marginBottom: 16, boxShadow: shadow.card }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Notes</h3>
            {editing ? (
              <textarea value={String(form.notes ?? "")} onChange={e => setForm(f => ({ ...f, notes: e.target.value || null }))} rows={4}
                style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, resize: "vertical" as const }} />
            ) : (
              <p style={{ margin: 0, fontSize: 14, color: piece.notes ? color.textMuted : "#D1D5DB", lineHeight: 1.6 }}>{piece.notes ?? "—"}</p>
            )}
          </div>

          {/* Files & Attachments */}
          {!editing && (
            <InventoryAttachmentsPanel
              entityType="inventory_piece"
              entityId={params.id}
              readOnly={!isManager}
            />
          )}

          {/* RFID Tag */}
          {!editing && (
            <RfidPanel pieceId={params.id} tenantId={tenantId} isManager={isManager} />
          )}

          {/* Delete */}
          {isManager && !editing && (
            <div style={{ borderTop: `1px solid ${color.line}`, paddingTop: 16 }}>
              <button onClick={handleDelete}
                style={{ padding: "8px 16px", borderRadius: radius.pill, border: "1px solid #FCA5A5", background: "#FEF2F2", color: "#DC2626", fontSize: 13, cursor: "pointer" }}>
                Delete Item
              </button>
            </div>
          )}
        </div>

        {/* ═══ RIGHT: Timeline ═══ */}
        <div style={{ position: "sticky", top: 24 }}>
          <div style={{ background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg, padding: 20, boxShadow: shadow.card }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <Clock size={13} style={{ color: color.textFaint }} />
              <h3 style={{ margin: 0, fontSize: 11, fontWeight: 700, color: color.textFaint, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>History</h3>
              <span style={{ marginLeft: "auto", fontSize: 11, color: color.textFaint }}>{movements.length} movement{movements.length !== 1 ? "s" : ""}</span>
            </div>
            <Timeline piece={piece} movements={movements} />
          </div>
        </div>
      </div>

      {/* ── Move Modal ── */}
      {showMove && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: color.white, borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: color.ink }}>Move Item</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: color.textFaint }}>
                  Currently: {buildLocationPath(piece.location?.id, ref?.locations ?? [], piece.location?.name ?? "no location")} · {piece.status?.name ?? "no status"}
                </p>
              </div>
              <button onClick={() => setShowMove(false)} style={{ background: "none", border: "none", cursor: "pointer", color: color.textMuted }}><X size={20} /></button>
            </div>
            {moveError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{moveError}</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>New Location</label>
                <select value={moveForm.to_location_id} onChange={e => setMoveForm(f => ({ ...f, to_location_id: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, background: color.white }}>
                  <option value="">— Keep current —</option>
                  {ref?.locations.map(l => <option key={l.id} value={l.id}>{buildLocationPath(l.id, ref.locations, l.name)}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>New Status</label>
                <select value={moveForm.to_status_id} onChange={e => setMoveForm(f => ({ ...f, to_status_id: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, background: color.white }}>
                  <option value="">— Keep current —</option>
                  {ref?.statuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Notes</label>
                <input value={moveForm.notes} onChange={e => setMoveForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Optional reason…"
                  style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowMove(false)}
                style={{ flex: 1, padding: "10px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 14, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleMove} disabled={moveSaving}
                style={{ flex: 1, padding: "10px", borderRadius: radius.pill, border: "none", background: color.ink, color: color.white, fontSize: 14, fontWeight: 500, cursor: moveSaving ? "not-allowed" : "pointer", opacity: moveSaving ? 0.7 : 1 }}>
                {moveSaving ? "Saving…" : "Log Movement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mark as Sold Modal ── */}
      {showSell && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: color.white, borderRadius: 16, padding: 32, width: "100%", maxWidth: 480, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" as const }}>

            {sellSuccess ? (
              /* ── Success state ── */
              <div style={{ textAlign: "center", padding: "8px 0" }}>
                <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <DollarSign size={24} style={{ color: "#10B981" }} />
                </div>
                <h2 style={{ margin: "0 0 8px", fontSize: 20, fontWeight: 700, color: color.ink }}>Sale Recorded</h2>
                <p style={{ margin: "0 0 16px", fontSize: 14, color: color.textMuted }}>
                  {sellSuccess?.paired_sku
                    ? <><strong style={{ fontFamily: "monospace" }}>{piece.sku}</strong> + <strong style={{ fontFamily: "monospace" }}>{sellSuccess.paired_sku}</strong> have been marked as sold.</>
                    : <>{piece.sku} has been marked as sold.</>}
                </p>
                {sellSuccess.gross_profit != null && (
                  <div style={{ background: "#F0FDF4", border: "1px solid #86EFAC", borderRadius: 8, padding: "10px 16px", marginBottom: 12 }}>
                    <div style={{ fontSize: 12, color: "#166534", fontWeight: 600 }}>Gross Profit</div>
                    <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "monospace", color: "#15803D" }}>{fmtMoney(sellSuccess.gross_profit)}</div>
                  </div>
                )}
                {sellSuccess.note && (
                  <div style={{ background: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8, padding: "10px 16px", marginBottom: 12, fontSize: 12, color: "#92400E", textAlign: "left" as const }}>
                    ⚠ {sellSuccess.note}
                  </div>
                )}
                <button onClick={() => { setShowSell(false); setSellSuccess(null); }}
                  style={{ width: "100%", padding: "10px", borderRadius: radius.pill, border: "none", background: color.ink, color: color.white, fontSize: 14, fontWeight: 500, cursor: "pointer", marginTop: 8 }}>
                  Done
                </button>
              </div>
            ) : (
              /* ── Form state ── */
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: color.ink }}>Mark as Sold</h2>
                    <p style={{ margin: "4px 0 0", fontSize: 13, color: color.textFaint }}>{piece.sku}{piece.title ? ` — ${piece.title}` : ""}</p>
                  </div>
                  <button onClick={() => setShowSell(false)} style={{ background: "none", border: "none", cursor: "pointer", color: color.textMuted }}><X size={20} /></button>
                </div>

                {/* Pair toggle — shown only when a non-sold paired piece exists */}
                {pairedPiece && !pairedPiece.is_sold && (
                  <div style={{ marginBottom: 16, padding: "10px 14px", background: "#F5F3FF", border: "1px solid #C4B5FD", borderRadius: radius.md, display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#5B21B6", flex: 1 }}>
                      Paired with <strong style={{ fontFamily: "monospace" }}>{pairedPiece.sku}</strong>
                    </span>
                    <div style={{ display: "flex", borderRadius: 7, overflow: "hidden", border: "1px solid #C4B5FD" }}>
                      <button
                        onClick={() => {
                          setSellAsPair(false);
                          setSellForm(f => ({ ...f, sold_price: piece.retail_price != null ? String(piece.retail_price) : "" }));
                        }}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: !sellAsPair ? color.ink : "#EDE9FE", color: !sellAsPair ? color.white : "#5B21B6" }}>
                        Individually
                      </button>
                      <button
                        onClick={() => {
                          setSellAsPair(true);
                          const r1 = Number(piece.retail_price ?? 0);
                          const r2 = Number(pairedPiece.retail_price ?? 0);
                          const combined = r1 + r2;
                          setSellForm(f => ({ ...f, sold_price: combined > 0 ? String(combined) : f.sold_price }));
                        }}
                        style={{ padding: "5px 12px", fontSize: 12, fontWeight: 500, border: "none", cursor: "pointer", background: sellAsPair ? color.ink : "#EDE9FE", color: sellAsPair ? color.white : "#5B21B6" }}>
                        Sell as pair
                      </button>
                    </div>
                  </div>
                )}

                {sellAsPair && pairedPiece && !pairedPiece.is_sold && (
                  <div style={{ marginBottom: 16, padding: "8px 12px", background: color.paper, border: `1px solid ${color.line}`, borderRadius: 8, fontSize: 12, color: color.textMuted }}>
                    <div style={{ marginBottom: 4, fontWeight: 500, color: color.textMuted }}>Both pieces will be marked as sold</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "monospace" }}>{piece.sku}</span>
                      <span>{piece.retail_price != null ? fmtMoney(piece.retail_price) : "no price set"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ fontFamily: "monospace" }}>{pairedPiece.sku}</span>
                      <span>{pairedPiece.retail_price != null ? fmtMoney(pairedPiece.retail_price) : "no price set"}</span>
                    </div>
                  </div>
                )}

                {sellError && (
                  <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{sellError}</div>
                )}

                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                  {/* Sold price + discount — side by side */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>
                        Sold Price <span style={{ color: "#EF4444" }}>*</span>
                      </label>
                      <input
                        type="number" min="0" step="0.01"
                        value={sellForm.sold_price}
                        onChange={e => setSellForm(f => ({ ...f, sold_price: e.target.value }))}
                        placeholder="0.00"
                        style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Discount</label>
                      <input
                        type="number" min="0" step="0.01"
                        value={sellForm.discount_amount}
                        onChange={e => setSellForm(f => ({ ...f, discount_amount: e.target.value }))}
                        placeholder="0.00"
                        style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                      />
                    </div>
                  </div>

                  {/* Net price preview */}
                  {sellForm.sold_price && (
                    <div style={{ fontSize: 13, color: color.textMuted, padding: "6px 10px", background: color.paper, borderRadius: 6 }}>
                      Net: <strong style={{ fontFamily: "monospace", color: color.ink }}>
                        {fmtMoney(parseFloat(sellForm.sold_price || "0") - parseFloat(sellForm.discount_amount || "0"))}
                      </strong>
                      {piece.retail_price != null && (
                        <span style={{ color: color.textFaint, marginLeft: 8 }}>
                          (listed at {fmtMoney(piece.retail_price)})
                        </span>
                      )}
                    </div>
                  )}

                  {/* Payment method */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Payment Method</label>
                    <select
                      value={sellForm.payment_method}
                      onChange={e => setSellForm(f => ({ ...f, payment_method: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, background: color.white }}>
                      <option value="">— Select —</option>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>

                  {/* Customer — search/select */}
                  <div style={{ position: "relative" as const }}>
                    <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Customer</label>
                    {custDisplay ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, background: color.paper }}>
                        <span style={{ flex: 1, fontSize: 14, color: color.ink }}>{custDisplay}</span>
                        <button
                          onClick={() => { setSellForm(f => ({ ...f, customer_id: "" })); setCustDisplay(""); }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: color.textFaint, padding: 0 }}>
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <>
                        <input
                          type="text"
                          value={custSearch}
                          onChange={e => setCustSearch(e.target.value)}
                          onBlur={() => setTimeout(() => setCustDropdown(false), 200)}
                          placeholder="Search by name or email…"
                          style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                        />
                        {custDropdown && custResults.length > 0 && (
                          <div style={{ position: "absolute" as const, top: "100%", left: 0, right: 0, background: color.white, border: `1px solid ${color.line}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 10, marginTop: 4, overflow: "hidden" }}>
                            {custResults.map(c => (
                              <div key={c.id}
                                onMouseDown={() => selectCustomer(c)}
                                style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14 }}
                                onMouseEnter={e => (e.currentTarget.style.background = color.paper)}
                                onMouseLeave={e => (e.currentTarget.style.background = "")}>
                                <div style={{ fontWeight: 500, color: color.ink }}>{`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}</div>
                                {c.email && <div style={{ fontSize: 12, color: color.textFaint }}>{c.email}</div>}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Salesperson */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Salesperson</label>
                    <select
                      value={sellForm.staff_id}
                      onChange={e => setSellForm(f => ({ ...f, staff_id: e.target.value }))}
                      style={{ width: "100%", padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14, background: color.white }}>
                      <option value="">— None —</option>
                      {staffList.map(s => (
                        <option key={s.id} value={s.id}>{s.full_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Notes */}
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Notes</label>
                    <input
                      type="text"
                      value={sellForm.notes}
                      onChange={e => setSellForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional — order ref, special instructions…"
                      style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }}
                    />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
                  <button onClick={() => setShowSell(false)}
                    style={{ flex: 1, padding: "11px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 14, cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={handleSell} disabled={sellSaving}
                    style={{ flex: 1, padding: "11px", borderRadius: radius.pill, border: "none", background: "#10B981", color: color.white, fontSize: 14, fontWeight: 600, cursor: sellSaving ? "not-allowed" : "pointer", opacity: sellSaving ? 0.7 : 1 }}>
                    {sellSaving ? "Recording…" : "Confirm Sale"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Reserve Modal ── */}
      {showReserve && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: color.white, borderRadius: 16, padding: 32, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: color.ink }}>Reserve Item</h2>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: color.textFaint }}>{piece.sku}{piece.title ? ` — ${piece.title}` : ""}</p>
              </div>
              <button onClick={() => setShowReserve(false)} style={{ background: "none", border: "none", cursor: "pointer", color: color.textMuted }}><X size={20} /></button>
            </div>

            {resError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 16 }}>{resError}</div>}

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Customer search */}
              <div style={{ position: "relative" as const }}>
                <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Customer</label>
                {resCustDisplay ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, background: color.paper }}>
                    <span style={{ flex: 1, fontSize: 14, color: color.ink }}>{resCustDisplay}</span>
                    <button onClick={() => { setResCustId(""); setResCustDisplay(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: color.textFaint, padding: 0 }}><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <input type="text" value={resCustSearch} onChange={e => setResCustSearch(e.target.value)} onBlur={() => setTimeout(() => setResCustDropdown(false), 200)}
                      placeholder="Search by name or email…"
                      style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }} />
                    {resCustDropdown && resCustResults.length > 0 && (
                      <div style={{ position: "absolute" as const, top: "100%", left: 0, right: 0, background: color.white, border: `1px solid ${color.line}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.1)", zIndex: 10, marginTop: 4, overflow: "hidden" }}>
                        {resCustResults.map(c => (
                          <div key={c.id} onMouseDown={() => selectResCust(c)}
                            style={{ padding: "10px 14px", cursor: "pointer", fontSize: 14 }}
                            onMouseEnter={e => (e.currentTarget.style.background = color.paper)}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}>
                            <div style={{ fontWeight: 500, color: color.ink }}>{`${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "—"}</div>
                            {c.email && <div style={{ fontSize: 12, color: color.textFaint }}>{c.email}</div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Reason */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Reason</label>
                <input type="text" value={reserveForm.reason} onChange={e => setReserveForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="e.g. Layby, customer on order, workshop hold…"
                  style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }} />
              </div>

              {/* Expiry + refs side by side */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Expiry Date</label>
                  <input type="date" value={reserveForm.expires_at} onChange={e => setReserveForm(f => ({ ...f, expires_at: e.target.value }))}
                    style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }} />
                </div>
                <div>
                  <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Quote Ref</label>
                  <input type="text" value={reserveForm.quote_reference} onChange={e => setReserveForm(f => ({ ...f, quote_reference: e.target.value }))}
                    placeholder="Optional"
                    style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Order Ref</label>
                <input type="text" value={reserveForm.order_reference} onChange={e => setReserveForm(f => ({ ...f, order_reference: e.target.value }))}
                  placeholder="Optional"
                  style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 24 }}>
              <button onClick={() => setShowReserve(false)} style={{ flex: 1, padding: "11px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleReserve} disabled={resSaving}
                style={{ flex: 1, padding: "11px", borderRadius: radius.pill, border: "none", background: "#F59E0B", color: color.white, fontSize: 14, fontWeight: 600, cursor: resSaving ? "not-allowed" : "pointer", opacity: resSaving ? 0.7 : 1 }}>
                {resSaving ? "Reserving…" : "Reserve Item"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Release Reservation Modal ── */}
      {showRelease && activeRes && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: color.white, borderRadius: 16, padding: 32, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: color.ink }}>Release Reservation</h2>
              <button onClick={() => setShowRelease(false)} style={{ background: "none", border: "none", cursor: "pointer", color: color.textMuted }}><X size={20} /></button>
            </div>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: color.textMuted }}>
              This will return <strong>{piece.sku}</strong> to its previous status
              {activeRes.previous_status ? ` (${activeRes.previous_status.name})` : ""}.
            </p>
            {relError && <div style={{ padding: "10px 14px", background: "#FEF2F2", color: "#DC2626", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{relError}</div>}
            <div>
              <label style={{ fontSize: 13, fontWeight: 500, color: color.textMuted, display: "block", marginBottom: 4 }}>Reason (optional)</label>
              <input type="text" value={releaseReason} onChange={e => setReleaseReason(e.target.value)}
                placeholder="e.g. Customer changed mind, quote expired…"
                style={{ width: "100%", boxSizing: "border-box" as const, padding: "9px 12px", borderRadius: radius.md, border: `1px solid ${color.line}`, fontSize: 14 }} />
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button onClick={() => setShowRelease(false)} style={{ flex: 1, padding: "11px", borderRadius: radius.pill, border: `1px solid ${color.line}`, background: color.white, fontSize: 14, cursor: "pointer" }}>Cancel</button>
              <button onClick={handleRelease} disabled={relSaving}
                style={{ flex: 1, padding: "11px", borderRadius: radius.pill, border: "none", background: color.textMuted, color: color.white, fontSize: 14, fontWeight: 600, cursor: relSaving ? "not-allowed" : "pointer", opacity: relSaving ? 0.7 : 1 }}>
                {relSaving ? "Releasing…" : "Release"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </EditContext.Provider>
  );
}
