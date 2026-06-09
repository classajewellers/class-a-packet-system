"use client";

import { useState } from "react";
import { useUser } from "@/context/UserContext";
import { ItemSpecifications, StoneSpec } from "@/lib/types";

const METAL_TYPES = ["9ct Yellow Gold","9ct White Gold","9ct Rose Gold","18ct Yellow Gold","18ct White Gold","18ct Rose Gold","Platinum 950","Sterling Silver","Other"];
const FINISHES = ["Polished","Brushed","Satin","Hammered","Mixed"];
const STONE_TYPES = ["Diamond","Ruby","Sapphire","Emerald","Pearl","Opal","Aquamarine","Morganite","Tsavorite","Other"];
const CERT_LABS = ["GIA","IGI","None","Other"];
const SHAPES = ["Round Brilliant","Princess","Oval","Cushion","Emerald Cut","Pear","Marquise","Radiant","Asscher","Heart","Other"];
const COLOUR_GRADES = ["D","E","F","G","H","I","J","K","L","M","N","Fancy"];
const CLARITY_GRADES = ["FL","IF","VVS1","VVS2","VS1","VS2","SI1","SI2","I1","I2","I3"];
const GRADE_OPTIONS = ["Excellent","Very Good","Good","Fair","Poor","N/A"];
const FLUORESCENCE = ["None","Faint","Medium","Strong","Very Strong"];
const SETTING_TYPES = ["Claw/Prong","Bezel","Channel","Pavé","Flush/Gypsy","Tension","Bar","Cluster","Other"];
const ITEM_TYPES = ["Engagement Ring","Wedding Ring","Dress Ring","Pendant","Necklace","Bracelet","Earrings","Bangle","Brooch","Cufflinks","Other"];

const EMPTY_STONE: Omit<StoneSpec, "id"> = {
  stone_type: "Diamond", certificate_lab: "None", certificate_number: "",
  shape: "Round Brilliant", carat_weight: "", colour_grade: "G",
  clarity_grade: "VS1", cut_grade: "Excellent", polish: "Excellent",
  symmetry: "Excellent", fluorescence: "None", measurements: "", setting_type: "Claw/Prong",
};

const EMPTY_SPECS: ItemSpecifications = {
  metal_type: "18ct Yellow Gold", metal_weight: "", hallmark: "", finish: "Polished",
  stones: [], accent_description: "", accent_carat_weight: "",
  item_type: "Engagement Ring", ring_size: "", item_description: "",
};

function newStoneId() { return Math.random().toString(36).slice(2, 10); }

/** Merge raw DB value (may be {}, null, or a full spec) with EMPTY_SPECS defaults.
 *  This guards against the DB column default `'{}'` producing an object with no `stones` array. */
function normalizeSpecs(raw: ItemSpecifications | Record<string, unknown> | null | undefined): ItemSpecifications {
  if (!raw || Object.keys(raw).length === 0) return { ...EMPTY_SPECS, stones: [] };
  const r = raw as Partial<ItemSpecifications>;
  return {
    ...EMPTY_SPECS,
    ...r,
    stones: Array.isArray(r.stones) ? r.stones : [],
  };
}

interface Props {
  packetId: string;
  specs: ItemSpecifications | null;
  valuationStatus: string | null;
  onSave: (specs: ItemSpecifications) => void;
  onSubmitForReview: (specs: ItemSpecifications) => void;
  onApprove?: (specs: ItemSpecifications, erv: number) => void;
  isSam?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function ItemSpecificationsForm({ packetId: _packetId, specs: initialSpecs, valuationStatus, onSave, onSubmitForReview, onApprove, isSam }: Props) {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [specs, setSpecs] = useState<ItemSpecifications>(() => normalizeSpecs(initialSpecs));
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [erv, setErv] = useState<string>("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const fieldStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #E8E8F0', borderRadius: 8,
    background: '#fff', fontSize: 14, padding: '0 12px', color: '#1A1A2E',
    outline: 'none', height: 40, fontFamily: 'inherit',
  };

  function update<K extends keyof ItemSpecifications>(key: K, value: ItemSpecifications[K]) {
    setSpecs((prev) => ({ ...prev, [key]: value }));
  }

  function updateStone(id: string, key: keyof StoneSpec, value: string) {
    setSpecs((prev) => ({
      ...prev,
      stones: (prev.stones ?? []).map((s) => s.id === id ? { ...s, [key]: value } : s),
    }));
  }

  function addStone() {
    setSpecs((prev) => ({ ...prev, stones: [...(prev.stones ?? []), { ...EMPTY_STONE, id: newStoneId() }] }));
  }

  function removeStone(id: string) {
    setSpecs((prev) => ({ ...prev, stones: (prev.stones ?? []).filter((s) => s.id !== id) }));
  }

  function handleBlur() {
    onSave(specs);
  }

  async function generateDescription() {
    setGeneratingDesc(true);
    try {
      const mainStone = (specs.stones ?? [])[0];
      const prompt = [
        `Item type: ${specs.item_type}`,
        `Metal: ${specs.metal_weight}g ${specs.metal_type}, hallmarked ${specs.hallmark}, ${specs.finish} finish`,
        mainStone ? `Main stone: ${mainStone.carat_weight}ct ${mainStone.shape} ${mainStone.stone_type}, ${mainStone.colour_grade} colour, ${mainStone.clarity_grade} clarity, ${mainStone.cut_grade} cut, ${mainStone.certificate_lab} certified ${mainStone.certificate_number}` : "",
        specs.accent_description ? `Accent stones: ${specs.accent_description}` : "",
        specs.ring_size ? `Ring size: ${specs.ring_size}` : "",
        mainStone ? `Setting: ${mainStone.setting_type}` : "",
      ].filter(Boolean).join("\n");

      const res = await fetch("/api/assistant/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ prompt }),
      });
      const json = await res.json();
      if (json.description) {
        const updated = { ...specs, item_description: json.description };
        setSpecs(updated);
        onSave(updated);
      }
    } catch (err) {
      console.error("Generate description failed:", err);
    } finally {
      setGeneratingDesc(false);
    }
  }

  async function handleSubmitForReview() {
    setSubmitting(true);
    try {
      await onSubmitForReview(specs);
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleApprove() {
    console.log("[ItemSpecificationsForm] Approve clicked", { hasOnApprove: !!onApprove, erv });
    if (!onApprove || !erv) return;
    setApproving(true);
    setApproveError(null);
    try {
      await onApprove(specs, parseFloat(erv));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approval failed — check console for details";
      console.error("[ItemSpecificationsForm] handleApprove error:", msg);
      setApproveError(msg);
    } finally {
      setApproving(false);
    }
  }

  const hasSpecs = specs.metal_type || (specs.stones ?? []).length > 0 || specs.item_description;

  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 };
  const sectionHeadStyle: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, borderBottom: '1px solid #E8E8F0', paddingBottom: 4 };

  return (
    <div style={{ border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>
      {/* Collapsible header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#F9FAFB', border: 'none', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Specifications &amp; Valuation</span>
          {valuationStatus && valuationStatus !== "draft" && (
            <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
              ...(valuationStatus === "approved" ? { background: '#DCFCE7', color: '#166534' } :
                  valuationStatus === "pending_review" ? { background: '#FEF3C7', color: '#92400E' } :
                  { background: '#F3F4F6', color: '#6B7280' }) }}>
              {valuationStatus === "approved" ? "✓ Approved" :
               valuationStatus === "pending_review" ? "⏳ Pending Review" : valuationStatus}
            </span>
          )}
        </div>
        <svg style={{ width: 16, height: 16, color: '#9CA3AF', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Status banner */}
          {submitted && valuationStatus !== "approved" && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#DCFCE7', border: '1px solid #BBF7D0', borderRadius: 12, padding: '8px 12px' }}>
              <span style={{ color: '#166534' }}>✓</span>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#166534', margin: 0 }}>Sent to Sam for review</p>
            </div>
          )}

          {/* Metal */}
          <div>
            <p style={sectionHeadStyle}>Metal</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Metal Type</label>
                <select value={specs.metal_type} onChange={(e) => update("metal_type", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                  {METAL_TYPES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Weight (g)</label>
                <input type="number" step="0.01" value={specs.metal_weight} onChange={(e) => update("metal_weight", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="4.20" />
              </div>
              <div>
                <label style={labelStyle}>Hallmark</label>
                <input type="text" value={specs.hallmark} onChange={(e) => update("hallmark", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="750" />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Finish</label>
                <select value={specs.finish} onChange={(e) => update("finish", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                  {FINISHES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Main Stones */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E8E8F0', paddingBottom: 4, marginBottom: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Main Stones</p>
              <button onClick={addStone} style={{ fontSize: 12, fontWeight: 600, color: '#635BFF', background: 'transparent', border: 'none', cursor: 'pointer' }}>+ Add Stone</button>
            </div>
            {(specs.stones ?? []).length === 0 && (
              <p style={{ fontSize: 14, color: '#9CA3AF', fontStyle: 'italic' }}>No stones added — click + Add Stone</p>
            )}
            {(specs.stones ?? []).map((stone, idx) => (
              <div key={stone.id} style={{ background: '#F9FAFB', borderRadius: 10, border: '1px solid #E8E8F0', padding: 12, marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>Stone {idx + 1}</span>
                  <button onClick={() => removeStone(stone.id)} style={{ fontSize: 12, color: '#EF4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>Remove</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={labelStyle}>Stone Type</label>
                    <select value={stone.stone_type} onChange={(e) => updateStone(stone.id, "stone_type", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {STONE_TYPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Carat Weight</label>
                    <input type="number" step="0.01" value={stone.carat_weight} onChange={(e) => updateStone(stone.id, "carat_weight", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="1.02" />
                  </div>
                  <div>
                    <label style={labelStyle}>Certificate Lab</label>
                    <select value={stone.certificate_lab} onChange={(e) => updateStone(stone.id, "certificate_lab", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {CERT_LABS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Certificate #</label>
                    <input type="text" value={stone.certificate_number} onChange={(e) => updateStone(stone.id, "certificate_number", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="2336753259" />
                  </div>
                  <div>
                    <label style={labelStyle}>Shape</label>
                    <select value={stone.shape} onChange={(e) => updateStone(stone.id, "shape", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {SHAPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Colour</label>
                    <select value={stone.colour_grade} onChange={(e) => updateStone(stone.id, "colour_grade", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {COLOUR_GRADES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Clarity</label>
                    <select value={stone.clarity_grade} onChange={(e) => updateStone(stone.id, "clarity_grade", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {CLARITY_GRADES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Cut</label>
                    <select value={stone.cut_grade} onChange={(e) => updateStone(stone.id, "cut_grade", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Polish</label>
                    <select value={stone.polish} onChange={(e) => updateStone(stone.id, "polish", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Symmetry</label>
                    <select value={stone.symmetry} onChange={(e) => updateStone(stone.id, "symmetry", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Fluorescence</label>
                    <select value={stone.fluorescence} onChange={(e) => updateStone(stone.id, "fluorescence", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {FLUORESCENCE.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Setting Type</label>
                    <select value={stone.setting_type} onChange={(e) => updateStone(stone.id, "setting_type", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                      {SETTING_TYPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>Measurements</label>
                    <input type="text" value={stone.measurements} onChange={(e) => updateStone(stone.id, "measurements", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="6.5 x 6.48 x 3.9mm" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Accent Stones */}
          <div>
            <p style={sectionHeadStyle}>Accent Stones (optional)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <label style={labelStyle}>Description</label>
                <input type="text" value={specs.accent_description} onChange={(e) => update("accent_description", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="16 round brilliant pavé diamonds, approx 0.32ct TW, G-H, VS-SI" />
              </div>
              <div>
                <label style={labelStyle}>Total Carat Weight</label>
                <input type="number" step="0.01" value={specs.accent_carat_weight} onChange={(e) => update("accent_carat_weight", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="0.32" />
              </div>
            </div>
          </div>

          {/* Item Details */}
          <div>
            <p style={sectionHeadStyle}>Item Details</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Item Type</label>
                  <select value={specs.item_type} onChange={(e) => update("item_type", e.target.value)} onBlur={handleBlur} style={fieldStyle}>
                    {ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Ring Size</label>
                  <input type="text" value={specs.ring_size} onChange={(e) => update("ring_size", e.target.value)} onBlur={handleBlur} style={fieldStyle} placeholder="N" />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <label style={labelStyle}>Item Description</label>
                  <button
                    onClick={generateDescription}
                    disabled={generatingDesc}
                    style={{ fontSize: 12, fontWeight: 600, color: '#635BFF', background: 'transparent', border: 'none', cursor: 'pointer', opacity: generatingDesc ? 0.4 : 1 }}
                  >
                    {generatingDesc ? "Generating…" : "✨ Generate Description"}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={specs.item_description}
                  onChange={(e) => update("item_description", e.target.value)}
                  onBlur={handleBlur}
                  style={{ width: '100%', border: '1px solid #E8E8F0', borderRadius: 8, background: '#fff', fontSize: 14, padding: '8px 12px', color: '#1A1A2E', outline: 'none', fontFamily: 'inherit', resize: 'vertical' as const }}
                  placeholder="Professional jewellery description for the valuation certificate…"
                />
              </div>
            </div>
          </div>

          {/* Sam: ERV + Approve */}
          {isSam && valuationStatus === "pending_review" && (
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Sam&apos;s Review</p>
              <div>
                <label style={{ ...labelStyle, color: '#92400E' }}>Estimated Replacement Value (AUD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={erv}
                  onChange={(e) => setErv(e.target.value)}
                  style={fieldStyle}
                  placeholder="8500.00"
                />
              </div>
              {approveError && (
                <div style={{ fontSize: 12, fontWeight: 600, color: '#991B1B', background: '#FEE2E2', border: '1px solid #FECACA', borderRadius: 8, padding: '8px 12px' }}>
                  ✗ {approveError}
                </div>
              )}
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving || !erv}
                style={{ width: '100%', background: '#10B981', color: '#fff', fontWeight: 600, padding: '12px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, opacity: (approving || !erv) ? 0.4 : 1 }}
              >
                {approving ? "Approving…" : "✓ Approve & Generate Certificate"}
              </button>
            </div>
          )}

          {/* Submit for review */}
          {valuationStatus !== "approved" && valuationStatus !== "pending_review" && hasSpecs && (
            <button
              onClick={handleSubmitForReview}
              disabled={submitting || submitted}
              style={{ width: '100%', background: '#635BFF', color: '#fff', fontWeight: 600, padding: '12px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, opacity: (submitting || submitted) ? 0.4 : 1 }}
            >
              {submitting ? "Submitting…" : submitted ? "Sent to Sam for review ✓" : "Submit for Valuation Review"}
            </button>
          )}

        </div>
      )}
    </div>
  );
}
