"use client";

import { useState, useCallback, useRef } from "react";
import { Packet } from "@/lib/types";
import { packetTypeLabel } from "@/lib/formatters";
import { generatePrintHTML } from "@/lib/labelGenerator";

const STAFF_MEMBERS = [
  "Aisha Scott", "Arissa Michos", "Ben Mucklow", "Brad Mucklow",
  "Bridget Moore", "Charlotte Beavis", "Daniel Beecken", "David Johnson",
  "Dior Munro", "Donna Cordes", "Ivy Wood", "Jack Mullan",
  "Jess D'Alfonso", "Joseph Onorato", "Josh Mucklow", "Keeley Mucklow",
  "Leah Newton", "Melody Abram", "Monica Magshoodi", "Sam Mucklow",
  "Shahrzad Givi", "Sinziana Peters", "Viv Valladares",
];

interface Props {
  packet: Packet;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (updated: Packet) => void;
  onRetry: (
    packetId: string,
    output: "klaviyo" | "email" | "sms" | "sheets" | "label"
  ) => Promise<void>;
}

type SaveState = "idle" | "saving" | "saved" | "error";

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

function FieldLabel({ label, className = "" }: { label: string; className?: string }) {
  return (
    <label className={`block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1 ${className}`}>
      {label}
    </label>
  );
}

export default function PacketDetailDrawer({ packet, onClose, onDelete, onUpdate }: Props) {
  const [local, setLocal] = useState<Packet>(packet);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleting, setDeleting] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOnline = local.packet_type === "online_order";
  const internalNotes = (local.packet_data?.internal_notes as string | undefined) ?? "";

  // ── Patch helper ─────────────────────────────────────────────────────────
  const patch = useCallback(async (updates: Partial<Packet>) => {
    setSaveState("saving");
    try {
      const res = await fetch("/api/admin/packets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: local.id, updates }),
      });
      if (!res.ok) throw new Error("Failed");
      const json = await res.json() as { packet: Packet };
      setLocal(json.packet);
      onUpdate(json.packet);
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
    } catch {
      setSaveState("error");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [local.id, onUpdate]);

  // ── Field change helpers ──────────────────────────────────────────────────
  function set<K extends keyof Packet>(key: K, value: Packet[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function onBlur<K extends keyof Packet>(key: K, value: Packet[K]) {
    patch({ [key]: value });
  }

  function handleInternalNotesBlur(value: string) {
    const updated = { ...(local.packet_data ?? {}), internal_notes: value };
    setLocal((prev) => ({ ...prev, packet_data: updated }));
    patch({ packet_data: updated });
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!window.confirm(
      `Are you sure you want to delete order ${local.reference_number}? This cannot be undone.`
    )) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/packets/${local.id}`, { method: "DELETE" });
      if (res.ok) {
        onDelete(local.id);
      } else {
        const json = await res.json().catch(() => ({}));
        alert(`Failed to delete: ${json.error ?? "Unknown error"}`);
      }
    } catch {
      alert("Network error — could not delete order.");
    } finally {
      setDeleting(false);
    }
  }

  function handleReprintLabel() {
    const html = generatePrintHTML(local);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  // Compute balance locally for display
  const balance = ((local.total_charges ?? 0) - (local.deposit ?? 0));

  const inputClass =
    "w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black focus:bg-white transition-colors";

  const saveIndicator =
    saveState === "saving" ? (
      <span className="text-xs text-gray-400 animate-pulse">Saving…</span>
    ) : saveState === "saved" ? (
      <span className="text-xs text-emerald-600 font-semibold">✓ Saved</span>
    ) : saveState === "error" ? (
      <span className="text-xs text-red-500 font-semibold">Save failed</span>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs text-gray-500">{packetTypeLabel(local.packet_type)}</p>
            <h2 className="font-mono text-base font-bold text-black">{local.reference_number}</h2>
          </div>
          <div className="flex items-center gap-3">
            {saveIndicator}
            <button
              onClick={onClose}
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 space-y-6">

          {/* ── Reprint Label ── */}
          <button
            onClick={handleReprintLabel}
            className="w-full flex items-center justify-center gap-2 bg-black text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#222222] active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
            </svg>
            Reprint Label
          </button>

          {/* ── Internal Notes ── */}
          <Section title="Internal Notes">
            <textarea
              rows={3}
              placeholder="Add internal notes visible only to staff…"
              defaultValue={internalNotes}
              onBlur={(e) => handleInternalNotesBlur(e.target.value)}
              className={`${inputClass} resize-none`}
            />
          </Section>

          {/* ── Customer ── */}
          <Section title="Customer">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel label="First Name" />
                <input
                  type="text"
                  value={local.customer_first_name ?? ""}
                  onChange={(e) => set("customer_first_name", e.target.value)}
                  onBlur={(e) => onBlur("customer_first_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel label="Last Name" />
                <input
                  type="text"
                  value={local.customer_last_name ?? ""}
                  onChange={(e) => set("customer_last_name", e.target.value)}
                  onBlur={(e) => onBlur("customer_last_name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel label="Phone" />
                <input
                  type="text"
                  value={local.customer_phone ?? ""}
                  onChange={(e) => set("customer_phone", e.target.value)}
                  onBlur={(e) => onBlur("customer_phone", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel label="Email" />
                <input
                  type="email"
                  value={local.customer_email ?? ""}
                  onChange={(e) => set("customer_email", e.target.value)}
                  onBlur={(e) => onBlur("customer_email", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="col-span-2">
                <FieldLabel label="Street" />
                <input
                  type="text"
                  value={local.customer_street ?? ""}
                  onChange={(e) => set("customer_street", e.target.value)}
                  onBlur={(e) => onBlur("customer_street", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel label="Suburb" />
                <input
                  type="text"
                  value={local.customer_suburb ?? ""}
                  onChange={(e) => set("customer_suburb", e.target.value)}
                  onBlur={(e) => onBlur("customer_suburb", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel label="State" />
                  <input
                    type="text"
                    value={local.customer_state ?? ""}
                    onChange={(e) => set("customer_state", e.target.value)}
                    onBlur={(e) => onBlur("customer_state", e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel label="Postcode" />
                  <input
                    type="text"
                    value={local.customer_postcode ?? ""}
                    onChange={(e) => set("customer_postcode", e.target.value)}
                    onBlur={(e) => onBlur("customer_postcode", e.target.value)}
                    className={inputClass}
                  />
                </div>
              </div>
              {local.customer_number && (
                <div>
                  <FieldLabel label="Customer #" />
                  <input
                    type="text"
                    value={local.customer_number ?? ""}
                    onChange={(e) => set("customer_number", e.target.value)}
                    onBlur={(e) => onBlur("customer_number", e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
              {local.stock_number && (
                <div>
                  <FieldLabel label="Stock #" />
                  <input
                    type="text"
                    value={local.stock_number ?? ""}
                    onChange={(e) => set("stock_number", e.target.value)}
                    onBlur={(e) => onBlur("stock_number", e.target.value)}
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ── Dates ── */}
          <Section title="Dates">
            <div className="grid grid-cols-2 gap-3">
              {/* Due date prominent */}
              <div className="col-span-2">
                <FieldLabel label="Due Date" className="text-black font-bold" />
                <input
                  type="date"
                  value={local.due_date ?? ""}
                  onChange={(e) => {
                    set("due_date", e.target.value || null);
                    patch({ due_date: e.target.value || null });
                  }}
                  className={`${inputClass} border-black ring-0 font-semibold`}
                />
              </div>
              <div>
                <FieldLabel label="In Date" />
                <input
                  type="date"
                  value={local.in_date ?? ""}
                  onChange={(e) => {
                    set("in_date", e.target.value || null);
                    patch({ in_date: e.target.value || null });
                  }}
                  className={inputClass}
                />
              </div>
              {local.from_date !== undefined && (
                <div>
                  <FieldLabel label="From Date" />
                  <input
                    type="date"
                    value={local.from_date ?? ""}
                    onChange={(e) => {
                      set("from_date", e.target.value || null);
                      patch({ from_date: e.target.value || null });
                    }}
                    className={inputClass}
                  />
                </div>
              )}
              {local.collected_date !== undefined && (
                <div>
                  <FieldLabel label="Collected" />
                  <input
                    type="date"
                    value={local.collected_date ?? ""}
                    onChange={(e) => {
                      set("collected_date", e.target.value || null);
                      patch({ collected_date: e.target.value || null });
                    }}
                    className={inputClass}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ── Articles & Instructions ── */}
          <Section title="Articles & Instructions">
            <div className="space-y-3">
              <div>
                <FieldLabel label="Articles" />
                <textarea
                  rows={2}
                  value={local.articles ?? ""}
                  onChange={(e) => set("articles", e.target.value)}
                  onBlur={(e) => onBlur("articles", e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div>
                <FieldLabel label="Instructions" />
                <textarea
                  rows={3}
                  value={local.instructions ?? ""}
                  onChange={(e) => set("instructions", e.target.value)}
                  onBlur={(e) => onBlur("instructions", e.target.value)}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
          </Section>

          {/* ── Pricing ── */}
          <Section title="Pricing">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <FieldLabel label="Total" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={local.total_charges ?? ""}
                  onChange={(e) => set("total_charges", e.target.value === "" ? null : parseFloat(e.target.value))}
                  onBlur={(e) => onBlur("total_charges", e.target.value === "" ? null : parseFloat(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel label="Deposit" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={local.deposit ?? ""}
                  onChange={(e) => set("deposit", e.target.value === "" ? null : parseFloat(e.target.value))}
                  onBlur={(e) => onBlur("deposit", e.target.value === "" ? null : parseFloat(e.target.value))}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel label="Balance" />
                <div className={`${inputClass} bg-gray-100 text-gray-500 cursor-not-allowed`}>
                  {balance > 0 ? `$${balance.toFixed(2)}` : balance < 0 ? `-$${Math.abs(balance).toFixed(2)}` : "—"}
                </div>
              </div>
            </div>
          </Section>

          {/* ── Staff & Referral ── */}
          <Section title="Staff & Referral">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel label="Staff Member" />
                <select
                  value={local.staff_member ?? ""}
                  onChange={(e) => {
                    set("staff_member", e.target.value || null);
                    patch({ staff_member: e.target.value || null });
                  }}
                  className={inputClass}
                >
                  <option value="">— Unassigned —</option>
                  {STAFF_MEMBERS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel label="Referral Source" />
                <input
                  type="text"
                  value={local.referral_source ?? ""}
                  onChange={(e) => set("referral_source", e.target.value)}
                  onBlur={(e) => onBlur("referral_source", e.target.value || null)}
                  className={inputClass}
                />
              </div>
              <div>
                <FieldLabel label="Occasion" />
                <input
                  type="text"
                  value={local.occasion ?? ""}
                  onChange={(e) => set("occasion", e.target.value)}
                  onBlur={(e) => onBlur("occasion", e.target.value || null)}
                  className={inputClass}
                />
              </div>
              {local.repair_tracker_number !== undefined && (
                <div>
                  <FieldLabel label="Repair Tracker #" />
                  <input
                    type="text"
                    value={local.repair_tracker_number ?? ""}
                    onChange={(e) => set("repair_tracker_number", e.target.value)}
                    onBlur={(e) => onBlur("repair_tracker_number", e.target.value || null)}
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <FieldLabel label="Signed By" />
                <input
                  type="text"
                  value={local.signed_by ?? ""}
                  onChange={(e) => set("signed_by", e.target.value)}
                  onBlur={(e) => onBlur("signed_by", e.target.value || null)}
                  className={inputClass}
                />
              </div>
            </div>
          </Section>

          {/* ── Online Order fields ── */}
          {isOnline && (
            <Section title="Online Order">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel label="Order #" />
                  <input
                    type="text"
                    value={local.order_number ?? ""}
                    onChange={(e) => set("order_number", e.target.value)}
                    onBlur={(e) => onBlur("order_number", e.target.value || null)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel label="Order Source" />
                  <input
                    type="text"
                    value={local.order_source ?? ""}
                    onChange={(e) => set("order_source", e.target.value)}
                    onBlur={(e) => onBlur("order_source", e.target.value || null)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel label="Shipping Method" />
                  <input
                    type="text"
                    value={local.shipping_method ?? ""}
                    onChange={(e) => set("shipping_method", e.target.value)}
                    onBlur={(e) => onBlur("shipping_method", e.target.value || null)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel label="Tracking #" />
                  <input
                    type="text"
                    value={local.tracking_number ?? ""}
                    onChange={(e) => set("tracking_number", e.target.value)}
                    onBlur={(e) => onBlur("tracking_number", e.target.value || null)}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel label="Items Ordered" />
                  <textarea
                    rows={2}
                    value={local.items_ordered ?? ""}
                    onChange={(e) => set("items_ordered", e.target.value)}
                    onBlur={(e) => onBlur("items_ordered", e.target.value || null)}
                    className={`${inputClass} resize-none`}
                  />
                </div>
                <div className="col-span-2">
                  <FieldLabel label="Order Notes" />
                  <textarea
                    rows={2}
                    value={local.order_notes ?? ""}
                    onChange={(e) => set("order_notes", e.target.value)}
                    onBlur={(e) => onBlur("order_notes", e.target.value || null)}
                    className={`${inputClass} resize-none`}
                  />
                </div>
                {!local.shipping_address_same && (
                  <>
                    <div className="col-span-2">
                      <FieldLabel label="Shipping Street" />
                      <input
                        type="text"
                        value={local.shipping_street ?? ""}
                        onChange={(e) => set("shipping_street", e.target.value)}
                        onBlur={(e) => onBlur("shipping_street", e.target.value || null)}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <FieldLabel label="Shipping Suburb" />
                      <input
                        type="text"
                        value={local.shipping_suburb ?? ""}
                        onChange={(e) => set("shipping_suburb", e.target.value)}
                        onBlur={(e) => onBlur("shipping_suburb", e.target.value || null)}
                        className={inputClass}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <FieldLabel label="State" />
                        <input
                          type="text"
                          value={local.shipping_state ?? ""}
                          onChange={(e) => set("shipping_state", e.target.value)}
                          onBlur={(e) => onBlur("shipping_state", e.target.value || null)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <FieldLabel label="Postcode" />
                        <input
                          type="text"
                          value={local.shipping_postcode ?? ""}
                          onChange={(e) => set("shipping_postcode", e.target.value)}
                          onBlur={(e) => onBlur("shipping_postcode", e.target.value || null)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Section>
          )}

          {/* ── Additional packet_data fields (read-only, non-internal_notes) ── */}
          {local.packet_data && Object.keys(local.packet_data).filter(k => k !== "internal_notes").length > 0 && (
            <Section title="Additional Details">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {Object.entries(local.packet_data)
                  .filter(([k]) => k !== "internal_notes")
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-gray-400 uppercase tracking-wide font-semibold">
                        {k.replace(/_/g, " ")}
                      </dt>
                      <dd className="text-sm text-black mt-0.5">
                        {Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? "")}
                      </dd>
                    </div>
                  ))}
              </dl>
            </Section>
          )}

          <p className="text-xs text-gray-400">
            Created {new Date(local.created_at).toLocaleString("en-AU")}
          </p>

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
              {deleting ? "Deleting…" : "Delete Order"}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
