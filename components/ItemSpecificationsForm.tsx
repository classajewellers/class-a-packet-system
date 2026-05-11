"use client";

import { useState } from "react";
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
  const [open, setOpen] = useState(false);
  const [specs, setSpecs] = useState<ItemSpecifications>(() => normalizeSpecs(initialSpecs));
  const [generatingDesc, setGeneratingDesc] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [erv, setErv] = useState<string>("");
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const field = "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:bg-white transition-colors";

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
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-widest">Specifications & Valuation</span>
          {valuationStatus && valuationStatus !== "draft" && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${
              valuationStatus === "approved" ? "bg-emerald-100 text-emerald-700" :
              valuationStatus === "pending_review" ? "bg-amber-100 text-amber-700" :
              "bg-gray-100 text-gray-500"
            }`}>
              {valuationStatus === "approved" ? "✓ Approved" :
               valuationStatus === "pending_review" ? "⏳ Pending Review" : valuationStatus}
            </span>
          )}
        </div>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 py-4 space-y-5">

          {/* Status banner */}
          {submitted && valuationStatus !== "approved" && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              <span className="text-emerald-600">✓</span>
              <p className="text-sm font-semibold text-emerald-700">Sent to Sam for review</p>
            </div>
          )}

          {/* Metal */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-100 pb-1">Metal</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Metal Type</label>
                <select value={specs.metal_type} onChange={(e) => update("metal_type", e.target.value)} onBlur={handleBlur} className={field}>
                  {METAL_TYPES.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Weight (g)</label>
                <input type="number" step="0.01" value={specs.metal_weight} onChange={(e) => update("metal_weight", e.target.value)} onBlur={handleBlur} className={field} placeholder="4.20" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Hallmark</label>
                <input type="text" value={specs.hallmark} onChange={(e) => update("hallmark", e.target.value)} onBlur={handleBlur} className={field} placeholder="750" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Finish</label>
                <select value={specs.finish} onChange={(e) => update("finish", e.target.value)} onBlur={handleBlur} className={field}>
                  {FINISHES.map((f) => <option key={f}>{f}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Main Stones */}
          <div>
            <div className="flex items-center justify-between border-b border-gray-100 pb-1 mb-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Main Stones</p>
              <button onClick={addStone} className="text-xs font-semibold text-[#A3B2A4] hover:text-black transition-colors">+ Add Stone</button>
            </div>
            {(specs.stones ?? []).length === 0 && (
              <p className="text-sm text-gray-400 italic">No stones added — click + Add Stone</p>
            )}
            {(specs.stones ?? []).map((stone, idx) => (
              <div key={stone.id} className="bg-gray-50 rounded-xl border border-gray-200 p-3 mb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-700">Stone {idx + 1}</span>
                  <button onClick={() => removeStone(stone.id)} className="text-xs text-red-400 hover:text-red-600">Remove</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Stone Type</label>
                    <select value={stone.stone_type} onChange={(e) => updateStone(stone.id, "stone_type", e.target.value)} onBlur={handleBlur} className={field}>
                      {STONE_TYPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Carat Weight</label>
                    <input type="number" step="0.01" value={stone.carat_weight} onChange={(e) => updateStone(stone.id, "carat_weight", e.target.value)} onBlur={handleBlur} className={field} placeholder="1.02" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Certificate Lab</label>
                    <select value={stone.certificate_lab} onChange={(e) => updateStone(stone.id, "certificate_lab", e.target.value)} onBlur={handleBlur} className={field}>
                      {CERT_LABS.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Certificate #</label>
                    <input type="text" value={stone.certificate_number} onChange={(e) => updateStone(stone.id, "certificate_number", e.target.value)} onBlur={handleBlur} className={field} placeholder="2336753259" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Shape</label>
                    <select value={stone.shape} onChange={(e) => updateStone(stone.id, "shape", e.target.value)} onBlur={handleBlur} className={field}>
                      {SHAPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Colour</label>
                    <select value={stone.colour_grade} onChange={(e) => updateStone(stone.id, "colour_grade", e.target.value)} onBlur={handleBlur} className={field}>
                      {COLOUR_GRADES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Clarity</label>
                    <select value={stone.clarity_grade} onChange={(e) => updateStone(stone.id, "clarity_grade", e.target.value)} onBlur={handleBlur} className={field}>
                      {CLARITY_GRADES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Cut</label>
                    <select value={stone.cut_grade} onChange={(e) => updateStone(stone.id, "cut_grade", e.target.value)} onBlur={handleBlur} className={field}>
                      {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Polish</label>
                    <select value={stone.polish} onChange={(e) => updateStone(stone.id, "polish", e.target.value)} onBlur={handleBlur} className={field}>
                      {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Symmetry</label>
                    <select value={stone.symmetry} onChange={(e) => updateStone(stone.id, "symmetry", e.target.value)} onBlur={handleBlur} className={field}>
                      {GRADE_OPTIONS.map((g) => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Fluorescence</label>
                    <select value={stone.fluorescence} onChange={(e) => updateStone(stone.id, "fluorescence", e.target.value)} onBlur={handleBlur} className={field}>
                      {FLUORESCENCE.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Setting Type</label>
                    <select value={stone.setting_type} onChange={(e) => updateStone(stone.id, "setting_type", e.target.value)} onBlur={handleBlur} className={field}>
                      {SETTING_TYPES.map((s) => <option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Measurements</label>
                    <input type="text" value={stone.measurements} onChange={(e) => updateStone(stone.id, "measurements", e.target.value)} onBlur={handleBlur} className={field} placeholder="6.5 x 6.48 x 3.9mm" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Accent Stones */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-100 pb-1">Accent Stones (optional)</p>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Description</label>
                <input type="text" value={specs.accent_description} onChange={(e) => update("accent_description", e.target.value)} onBlur={handleBlur} className={field} placeholder="16 round brilliant pavé diamonds, approx 0.32ct TW, G-H, VS-SI" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Total Carat Weight</label>
                <input type="number" step="0.01" value={specs.accent_carat_weight} onChange={(e) => update("accent_carat_weight", e.target.value)} onBlur={handleBlur} className={field} placeholder="0.32" />
              </div>
            </div>
          </div>

          {/* Item Details */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 border-b border-gray-100 pb-1">Item Details</p>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Item Type</label>
                  <select value={specs.item_type} onChange={(e) => update("item_type", e.target.value)} onBlur={handleBlur} className={field}>
                    {ITEM_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">Ring Size</label>
                  <input type="text" value={specs.ring_size} onChange={(e) => update("ring_size", e.target.value)} onBlur={handleBlur} className={field} placeholder="N" />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-400 uppercase">Item Description</label>
                  <button
                    onClick={generateDescription}
                    disabled={generatingDesc}
                    className="text-xs font-semibold text-[#A3B2A4] hover:text-black transition-colors disabled:opacity-40"
                  >
                    {generatingDesc ? "Generating…" : "✨ Generate Description"}
                  </button>
                </div>
                <textarea
                  rows={4}
                  value={specs.item_description}
                  onChange={(e) => update("item_description", e.target.value)}
                  onBlur={handleBlur}
                  className={`${field} resize-none`}
                  placeholder="Professional jewellery description for the valuation certificate…"
                />
              </div>
            </div>
          </div>

          {/* Sam: ERV + Approve */}
          {isSam && valuationStatus === "pending_review" && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">Sam&apos;s Review</p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Estimated Replacement Value (AUD)</label>
                <input
                  type="number"
                  step="0.01"
                  value={erv}
                  onChange={(e) => setErv(e.target.value)}
                  className={field}
                  placeholder="8500.00"
                />
              </div>
              {approveError && (
                <div className="text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ✗ {approveError}
                </div>
              )}
              <button
                type="button"
                onClick={handleApprove}
                disabled={approving || !erv}
                className="w-full bg-emerald-600 text-white font-semibold py-3 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40"
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
              className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40"
            >
              {submitting ? "Submitting…" : submitted ? "Sent to Sam for review ✓" : "Submit for Valuation Review"}
            </button>
          )}

        </div>
      )}
    </div>
  );
}
