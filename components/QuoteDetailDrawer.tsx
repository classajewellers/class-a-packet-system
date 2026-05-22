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

const fieldStyle: React.CSSProperties = {
  width: '100%', border: '1px solid #E8E8F0', borderRadius: 8,
  background: '#fff', fontSize: 14, padding: '0 12px', color: '#1A1A2E',
  outline: 'none', height: 40, fontFamily: 'inherit',
};

function Field({ label, value }: { label: string; value?: string | null | number }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500, marginBottom: 2 }}>{label}</dt>
      <dd style={{ fontSize: 14, color: '#1A1A2E', marginTop: 2 }}>{String(value)}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p style={{ fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, borderBottom: '1px solid #E8E8F0', paddingBottom: 4 }}>
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
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

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
    setConvertError(null);
    setConverting(true);
    router.push(`/orders/new?from_quote=${local.id}`);
  }

  async function handleDelete() {
    if (!window.confirm(
      `Are you sure you want to delete quote ${local.reference_number}? This cannot be undone.`
    )) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/quotes/${local.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      console.log("[delete quote] Response:", json);
      if (json.success === true) {
        onDelete(local.id);
      } else {
        alert(`Failed to delete: ${json.error ?? "Unknown error"}`);
      }
    } catch {
      alert("Network error — could not delete quote.");
    } finally {
      setDeleting(false);
    }
  }

  // Stage transition buttons: all stages except current
  const otherStages = PIPELINE_STAGES.filter((s) => s !== stage);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex' }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />

      {/* Drawer */}
      <div style={{ width: 480, background: '#FFFFFF', borderLeft: '1px solid #E8E8F0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 20, background: '#FFFFFF', borderBottom: '1px solid #E8E8F0', position: 'sticky', top: 0, zIndex: 10 }}>
          <div>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{quoteTypeLabel}</p>
            <h2 style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>{local.reference_number}</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <span
                style={{ display: 'inline-block', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 600, color: '#fff', background: stageConfig.color }}
              >
                {stageConfig.label}
              </span>
              {isConverted && (
                <span style={{ display: 'inline-block', borderRadius: 999, padding: '2px 10px', fontSize: 12, fontWeight: 500, background: '#DBEAFE', color: '#1E40AF' }}>
                  Converted → {local.packet_reference}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
          >
            <svg style={{ width: 20, height: 20, color: '#6B7280' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Converted banner ── */}
          {isConverted && (
            <div style={{ borderRadius: 12, background: '#DCFCE7', border: '1px solid #BBF7D0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flexShrink: 0, width: 32, height: 32, borderRadius: '50%', background: '#86EFAC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg style={{ width: 16, height: 16, color: '#166534' }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700, color: '#166534', margin: 0 }}>Converted to Order</p>
                {local.packet_reference && (
                  <p style={{ fontSize: 12, color: '#16a34a', fontFamily: 'monospace', marginTop: 2 }}>{local.packet_reference}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Print action ── */}
          <button
            onClick={handleReprintQuote}
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#EEF2FF', color: '#635BFF', fontSize: 14, fontWeight: 600, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#635BFF' }
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF'}
          >
            <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Open Quote / Save PDF
          </button>

          {/* ── Convert error banner ── */}
          {convertError && (
            <div style={{ borderRadius: 12, background: '#FEE2E2', border: '1px solid #FECACA', padding: '12px 16px', fontSize: 14, color: '#991B1B', fontWeight: 500 }}>
              {convertError}
            </div>
          )}

          {/* ── Convert to Order (prominent when Job Won, not yet converted) ── */}
          {stage === "job_won" && !isConverted && (
            <button
              onClick={handleConvert}
              disabled={converting}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#10B981', color: '#fff', fontSize: 14, fontWeight: 700, padding: '12px 0', borderRadius: 8, border: 'none', cursor: 'pointer', opacity: converting ? 0.6 : 1 }}
            >
              {converting ? (
                <>
                  <svg style={{ width: 16, height: 16 }} className="animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Opening order form…
                </>
              ) : (
                <>
                  <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Convert to Order
                </>
              )}
            </button>
          )}

          {/* ── View Order link (once converted) ── */}
          {isConverted && local.packet_reference && (
            <button
              onClick={() => router.push("/orders")}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#635BFF', color: '#fff', fontSize: 14, fontWeight: 600, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer' }}
            >
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              View Order {local.packet_reference}
            </button>
          )}

          {/* ── Pipeline controls ── */}
          <Section title="Pipeline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Stage transition buttons */}
              <div>
                <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>Move to stage:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {otherStages.map((s) => (
                    <button
                      key={s}
                      onClick={() => moveToStage(s)}
                      disabled={moving}
                      style={{ fontSize: 12, fontWeight: 600, padding: '4px 12px', borderRadius: 6, border: '1px solid #E8E8F0', background: '#F9FAFB', color: '#374151', cursor: 'pointer', opacity: moving ? 0.5 : 1 }}
                    >
                      {s === "pending" ? "← " : "→ "}
                      {STAGE_CONFIG[s].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assigned To */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                  Assigned To
                </label>
                <select
                  value={local.assigned_to ?? ""}
                  onChange={(e) => handleAssignedTo(e.target.value)}
                  style={fieldStyle}
                >
                  <option value="">— Unassigned —</option>
                  {STAFF_MEMBERS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Follow Up Date */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, color: overdue && activeStage ? '#EF4444' : '#6B7280' }}>
                  Follow Up Date {overdue && activeStage && "· OVERDUE"}
                </label>
                <input
                  type="date"
                  value={local.follow_up_date ?? ""}
                  onChange={(e) => handleFollowUpDate(e.target.value)}
                  style={{ ...fieldStyle, border: overdue && activeStage ? '1px solid #FCA5A5' : '1px solid #E8E8F0', background: overdue && activeStage ? '#FEF2F2' : '#fff' }}
                />
              </div>
            </div>
          </Section>

          {/* ── Convert to Order (secondary — all non-converted stages except job_won handled above) ── */}
          {stage !== "job_won" && !isConverted && (
            <button
              onClick={handleConvert}
              disabled={converting}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#F9FAFB', color: '#6B7280', fontSize: 14, fontWeight: 600, padding: '10px 0', borderRadius: 8, border: '1px solid #E8E8F0', cursor: 'pointer', opacity: converting ? 0.6 : 1 }}
            >
              {converting ? "Opening order form…" : "Convert to Order"}
            </button>
          )}

          {/* ── Customer ── */}
          <Section title="Customer">
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              <Field label="Name" value={customerName} />
              <Field label="Phone" value={local.customer_phone} />
              <Field label="Email" value={local.customer_email} />
            </dl>
            {local.customer_email && (
              <div style={{ marginTop: 12 }}>
                <Link
                  href={`/customers/${encodeURIComponent(local.customer_email)}`}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#635BFF', textDecoration: 'none' }}
                >
                  View customer profile →
                </Link>
              </div>
            )}
          </Section>

          {/* ── Notes ── */}
          {local.notes && (
            <Section title="Notes">
              <p style={{ fontSize: 14, color: '#1A1A2E', whiteSpace: 'pre-wrap', margin: 0 }}>{local.notes}</p>
            </Section>
          )}

          {/* ── Line Items ── */}
          {(local.line_items ?? []).length > 0 && (
            <Section title="Line Items">
              <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #E8E8F0' }}>
                    <th style={{ paddingBottom: 8, textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', width: 20 }}>#</th>
                    <th style={{ paddingBottom: 8, textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase' }}>Design</th>
                    <th style={{ paddingBottom: 8, textAlign: 'left', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase' }}>Stone</th>
                    <th style={{ paddingBottom: 8, textAlign: 'right', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Price</th>
                  </tr>
                </thead>
                <tbody>
                  {(local.line_items ?? []).map((li, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #E8E8F0' }}>
                      <td style={{ padding: '8px 0', color: '#9CA3AF', fontSize: 12 }}>{i + 1}</td>
                      <td style={{ padding: '8px 8px 8px 0', color: '#1A1A2E' }}>{li.design ?? (li as {item?: string}).item}</td>
                      <td style={{ padding: '8px 8px 8px 0', color: '#6B7280' }}>{li.stone}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', color: '#1A1A2E', fontWeight: 600, whiteSpace: 'nowrap' }}>{li.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Staff & Created ── */}
          <Section title="Staff & Created">
            <dl style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
              <Field label="Staff Member" value={local.staff_member} />
              <Field label="Created At" value={createdAt} />
              {local.converted_at && (
                <Field label="Converted At" value={new Date(local.converted_at).toLocaleString("en-AU")} />
              )}
            </dl>
          </Section>

          {/* ── Delete ── */}
          <div style={{ paddingBottom: 8 }}>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#EF4444', color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px 0', borderRadius: 8, border: 'none', cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}
            >
              <svg style={{ width: 16, height: 16 }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
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
