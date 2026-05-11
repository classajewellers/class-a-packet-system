"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Quote } from "@/lib/types";
import { generateQuoteHTML } from "@/lib/quoteGenerator";
import {
  PIPELINE_STAGES,
  STAGE_CONFIG,
  PipelineStage,
  isOverdue,
  quoteStage,
} from "@/lib/pipeline";

const STAFF_MEMBERS = [
  "Aisha Scott", "Arissa Michos", "Ben Mucklow", "Brad Mucklow",
  "Bridget Moore", "Charlotte Beavis", "Daniel Beecken", "David Johnson",
  "Dior Munro", "Donna Cordes", "Ivy Wood", "Jack Mullan",
  "Jess D'Alfonso", "Joseph Onorato", "Josh Mucklow", "Keeley Mucklow",
  "Leah Newton", "Melody Abram", "Monica Magshoodi", "Sam Mucklow",
  "Shahrzad Givi", "Sinziana Peters", "Viv Valladares",
];

interface Props {
  quote: Quote;
  onClose: () => void;
  onUpdate: (updated: Quote) => void;
  onDelete: (id: string) => void;
}

function Field({ label, value }: { label: string; value?: string | null | number }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</dt>
      <dd className="text-sm text-black mt-0.5">{String(value)}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function QuoteDetailDrawer({ quote, onClose, onUpdate, onDelete }: Props) {
  const router = useRouter();
  const [local, setLocal] = useState<Quote>(quote);
  const [moving, setMoving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const stage = quoteStage(local.status);
  const stageConfig = STAGE_CONFIG[stage];
  const overdue = isOverdue(local.follow_up_date);
  const activeStage = stage !== "job_won" && stage !== "job_lost";

  const customerName = [local.customer_first_name, local.customer_last_name]
    .filter(Boolean).join(" ");
  const quoteTypeLabel = local.quote_type === "repair" ? "Repair Quote" : "Custom Order Quote";
  const isConverted = !!local.converted_to_packet_id;
  const createdAt = new Date(local.created_at).toLocaleString("en-AU");

  // ── PATCH helper ──────────────────────────────────────────────────────────
  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/quotes/${local.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const json = await res.json() as { quote: Quote };
    setLocal(json.quote);
    onUpdate(json.quote);
  }

  // ── Stage transition ──────────────────────────────────────────────────────
  async function moveToStage(target: PipelineStage) {
    setMoving(true);
    await patch({ status: target });
    setMoving(false);
  }

  // ── Assigned To ───────────────────────────────────────────────────────────
  async function handleAssignedTo(value: string) {
    setLocal((prev) => ({ ...prev, assigned_to: value || null }));
    await patch({ assigned_to: value || null });
  }

  // ── Follow Up Date ────────────────────────────────────────────────────────
  async function handleFollowUpDate(value: string) {
    setLocal((prev) => ({ ...prev, follow_up_date: value || null }));
    await patch({ follow_up_date: value || null });
  }

  function handleReprintQuote() {
    const html = generateQuoteHTML(local);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  function handleConvert() {
    router.push(`/?from_quote=${local.id}`);
  }

  async function handleDelete() {
    if (!window.confirm(
      `Are you sure you want to delete quote ${local.reference_number}? This cannot be undone.`
    )) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/quotes/${local.id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete(local.id);
      } else {
        const json = await res.json().catch(() => ({}));
        alert(`Failed to delete: ${json.error ?? "Unknown error"}`);
      }
    } catch {
      alert("Network error — could not delete quote.");
    } finally {
      setDeleting(false);
    }
  }

  const statusBadge = isConverted
    ? "bg-blue-100 text-blue-800"
    : "bg-gray-100 text-gray-600";

  // Stage transition buttons: all stages except current
  const otherStages = PIPELINE_STAGES.filter((s) => s !== stage);

  const stageBtnClass = (s: PipelineStage) => {
    if (s === "pending") {
      return "border border-gray-400 text-gray-600 hover:bg-gray-50 bg-white";
    }
    const c = STAGE_CONFIG[s];
    return `${c.tailwindBg} ${c.tailwindText}`;
  };

  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs text-gray-500">{quoteTypeLabel}</p>
            <h2 className="font-mono text-base font-bold text-black">{local.reference_number}</h2>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                style={{ backgroundColor: stageConfig.color }}
              >
                {stageConfig.label}
              </span>
              {isConverted && (
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
                  Converted → {local.packet_reference}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100 transition-colors">
            <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">

          {/* ── Converted banner ── */}
          {isConverted && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 flex items-center gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-800">Converted to Order</p>
                {local.packet_reference && (
                  <p className="text-xs text-emerald-600 font-mono mt-0.5">{local.packet_reference}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Print action ── */}
          <button
            onClick={handleReprintQuote}
            className="w-full flex items-center justify-center gap-2 bg-black text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#222222] active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Open Quote / Save PDF
          </button>

          {/* ── Convert to Order (prominent when Job Won, not yet converted) ── */}
          {stage === "job_won" && !isConverted && (
            <button
              onClick={handleConvert}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white text-sm font-bold py-3 rounded-xl hover:bg-emerald-600 active:scale-[0.98] transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Convert to Order
            </button>
          )}

          {/* ── View Order link (once converted) ── */}
          {isConverted && local.packet_reference && (
            <button
              onClick={() => {
                window.location.href = `/admin?tab=orders`;
              }}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white text-sm font-semibold py-3 rounded-xl hover:bg-blue-700 active:scale-[0.98] transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              View Order {local.packet_reference}
            </button>
          )}

          {/* ── Pipeline controls ── */}
          <Section title="Pipeline">
            <div className="space-y-3">
              {/* Stage transition buttons */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Move to stage:</p>
                <div className="flex flex-wrap gap-2">
                  {otherStages.map((s) => (
                    <button
                      key={s}
                      onClick={() => moveToStage(s)}
                      disabled={moving}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 ${stageBtnClass(s)}`}
                    >
                      {s === "pending" ? "← " : "→ "}
                      {STAGE_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assigned To */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Assigned To
                </label>
                <select
                  value={local.assigned_to ?? ""}
                  onChange={(e) => handleAssignedTo(e.target.value)}
                  className={inputClass}
                >
                  <option value="">— Unassigned —</option>
                  {STAFF_MEMBERS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Follow Up Date */}
              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wide mb-1 ${overdue && activeStage ? "text-red-600" : "text-gray-500"}`}>
                  Follow Up Date {overdue && activeStage && "· OVERDUE"}
                </label>
                <input
                  type="date"
                  value={local.follow_up_date ?? ""}
                  onChange={(e) => handleFollowUpDate(e.target.value)}
                  className={`${inputClass} ${overdue && activeStage ? "border-red-400 bg-red-50" : ""}`}
                />
              </div>
            </div>
          </Section>

          {/* ── Convert to Order (secondary — for pending stage) ── */}
          {stage === "pending" && !isConverted && (
            <button
              onClick={handleConvert}
              className="w-full flex items-center justify-center gap-2 bg-[#A3B2A4] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#8fa290] active:scale-[0.98] transition-all"
            >
              Convert to Order
            </button>
          )}

          {/* ── Customer ── */}
          <Section title="Customer">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Name" value={customerName} />
              <Field label="Phone" value={local.customer_phone} />
              <Field label="Email" value={local.customer_email} />
            </dl>
            {local.customer_email && (
              <div className="mt-3">
                <Link
                  href={`/customers/${encodeURIComponent(local.customer_email)}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#A3B2A4] hover:text-black transition-colors"
                >
                  View customer profile →
                </Link>
              </div>
            )}
          </Section>

          {/* ── Notes ── */}
          {local.notes && (
            <Section title="Notes">
              <p className="text-sm text-black whitespace-pre-wrap">{local.notes}</p>
            </Section>
          )}

          {/* ── Line Items ── */}
          {(local.line_items ?? []).length > 0 && (
            <Section title="Line Items">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase w-5">#</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase">Design</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase">Stone</th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(local.line_items ?? []).map((li, i) => (
                    <tr key={i}>
                      <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2 text-black pr-2">{li.design ?? (li as {item?: string}).item}</td>
                      <td className="py-2 text-gray-600 pr-2">{li.stone}</td>
                      <td className="py-2 text-right text-black font-medium whitespace-nowrap">{li.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Staff & Created ── */}
          <Section title="Staff & Created">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Staff Member" value={local.staff_member} />
              <Field label="Created At" value={createdAt} />
              {local.converted_at && (
                <Field label="Converted At" value={new Date(local.converted_at).toLocaleString("en-AU")} />
              )}
            </dl>
          </Section>

          {/* ── Delete ── */}
          <div className="pt-2 pb-4">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full flex items-center justify-center gap-2 bg-red-600 text-white text-sm font-semibold py-3 rounded-xl hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              {deleting ? "Deleting…" : "Delete Quote"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
