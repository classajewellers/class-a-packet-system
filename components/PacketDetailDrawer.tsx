"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { Packet } from "@/lib/types";
import { packetTypeLabel, formatDateAU } from "@/lib/formatters";
import { generatePrintHTML } from "@/lib/labelGenerator";
import { printOrderConfirmation } from "@/lib/orderConfirmationGenerator";

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
type NotifStep = "select" | "preview";
type Template  = "order_confirmation" | "ready_for_pickup";

interface Toast { type: "success" | "error"; message: string; }

// ── SMS / Email message builders ──────────────────────────────────────────
function buildMessage(template: Template, p: Packet): string {
  const firstName    = p.customer_first_name ?? "there";
  const orderType    = packetTypeLabel(p.packet_type);
  const ref          = p.reference_number;
  const articles     = p.articles ?? "";
  const instructions = p.instructions ?? "";
  const due          = formatDateAU(p.due_date) || "TBD";

  if (template === "order_confirmation") {
    return `Hi ${firstName}, thanks for visiting Class A Jewellers! Your ${orderType} ref is ${ref}. Items: ${articles}. Instructions: ${instructions}. Est. ready by ${due}. Any questions call 08 8344 7722. - Class A Team`;
  }
  return `Hi ${firstName}, great news! Your ${orderType} is ready for collection at Class A Jewellers, 40 North East Road Walkerville. Items: ${articles}. Ref: ${ref}. See you soon! - Class A Team`;
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

function Label({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <label className={`block text-xs uppercase tracking-wide mb-1 ${bold ? "font-bold text-black" : "font-semibold text-gray-400"}`}>
      {children}
    </label>
  );
}

export default function PacketDetailDrawer({ packet, onClose, onDelete, onUpdate }: Props) {
  const [local, setLocal] = useState<Packet>(packet);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleting, setDeleting] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Notification modal state ───────────────────────────────────────────────
  const [notifOpen, setNotifOpen]         = useState(false);
  const [notifStep, setNotifStep]         = useState<NotifStep>("select");
  const [notifTemplate, setNotifTemplate] = useState<Template | null>(null);
  const [notifSending, setNotifSending]   = useState(false);
  const [toast, setToast]                 = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss toast after 4 s
  useEffect(() => {
    if (!toast) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, [toast]);

  const isOnline  = local.packet_type === "online_order";
  const isShopify = isOnline && (local.order_source ?? "").toLowerCase() === "shopify";
  const showNotifButton = !isShopify; // hide for Shopify online orders

  // ── PATCH /api/admin/packets/[id] ────────────────────────────────────────
  const patch = useCallback(async (updates: Partial<Packet>) => {
    setSaveState("saving");
    try {
      const res = await fetch(`/api/admin/packets/${local.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Request failed");
      }
      const json = await res.json() as { packet: Packet };
      setLocal(json.packet);
      onUpdate(json.packet);
      setSaveState("saved");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 2000);
    } catch (err) {
      console.error("[PacketDetailDrawer] patch failed:", err);
      setSaveState("error");
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [local.id, onUpdate]);

  // Local update + blur save
  function set<K extends keyof Packet>(key: K, value: Packet[K]) {
    setLocal((prev) => ({ ...prev, [key]: value }));
  }

  function saveOnBlur<K extends keyof Packet>(key: K, value: Packet[K]) {
    patch({ [key]: value });
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

  // ── Notification handlers ─────────────────────────────────────────────────
  function openNotifModal() {
    setNotifStep("select");
    setNotifTemplate(null);
    setNotifOpen(true);
  }

  function closeNotifModal() {
    setNotifOpen(false);
    setNotifTemplate(null);
    setNotifStep("select");
  }

  function selectTemplate(t: Template) {
    setNotifTemplate(t);
    setNotifStep("preview");
  }

  async function handleSend(channel: "sms" | "email") {
    if (!notifTemplate) return;
    setNotifSending(true);
    try {
      const res = await fetch("/api/notifications/send", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ packet_id: local.id, template: notifTemplate, channel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      // Update local sms_sent flag for SMS sends
      if (channel === "sms") {
        const updated = { ...local, sms_sent: true };
        setLocal(updated);
        onUpdate(updated);
      }
      closeNotifModal();
      const dest = channel === "sms" ? (local.customer_phone ?? "customer") : (local.customer_email ?? "customer");
      setToast({ type: "success", message: `${channel === "sms" ? "SMS" : "Email"} sent to ${dest}` });
    } catch (err) {
      closeNotifModal();
      setToast({ type: "error", message: err instanceof Error ? err.message : `Failed to send ${channel === "sms" ? "SMS" : "email"}` });
    } finally {
      setNotifSending(false);
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

  // Compute displayed balance
  const balance = (local.total_charges ?? 0) - (local.deposit ?? 0);

  const field =
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
            <button onClick={onClose} className="rounded-full p-2 hover:bg-gray-100 transition-colors">
              <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 px-5 py-4 space-y-6">

          {/* ── DISPATCH DATE (online orders) — top hero, black border ── */}
          {isOnline && (
            <div className="rounded-2xl border-2 border-black bg-white p-4">
              <p className="text-xs font-bold text-black uppercase tracking-widest mb-2">📦 Dispatch Date</p>
              <input
                type="date"
                value={local.due_date ?? ""}
                onChange={(e) => {
                  set("due_date", e.target.value || null);
                  patch({ due_date: e.target.value || null });
                }}
                className="w-full rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-lg font-bold text-black focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>
          )}

          {/* ── Action buttons: Reprint + Send Notification ── */}
          <div className={`grid gap-2 ${showNotifButton ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              onClick={handleReprintLabel}
              className="flex items-center justify-center gap-2 bg-gray-100 text-black text-sm font-semibold py-3 rounded-xl hover:bg-gray-200 active:scale-[0.98] transition-all"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              Reprint Label
            </button>

            {showNotifButton && (
              <button
                onClick={openNotifModal}
                className="flex items-center justify-center gap-2 bg-black text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#222] active:scale-[0.98] transition-all"
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Send Notification
              </button>
            )}
          </div>

          {/* ── Print Confirmation (full-width, outline style) ── */}
          <button
            onClick={() => printOrderConfirmation(local)}
            className="flex items-center justify-center gap-2 w-full border border-gray-300 text-gray-700 text-sm font-semibold py-2.5 rounded-xl hover:bg-gray-50 hover:border-gray-400 active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            Print Confirmation
          </button>

          {/* ── DUE DATE (non-online orders) — black hero ── */}
          {!isOnline && (
            <div className="rounded-2xl bg-black p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Due Date</p>
              <input
                type="date"
                value={local.due_date ?? ""}
                onChange={(e) => {
                  set("due_date", e.target.value || null);
                  patch({ due_date: e.target.value || null });
                }}
                className="w-full rounded-xl border-0 bg-white px-4 py-3 text-lg font-bold text-black focus:outline-none focus:ring-2 focus:ring-white"
              />
            </div>
          )}

          {/* ── Internal Notes ── */}
          <Section title="Internal Notes">
            <textarea
              rows={3}
              placeholder="Staff notes — not printed on labels…"
              value={local.internal_notes ?? ""}
              onChange={(e) => set("internal_notes", e.target.value)}
              onBlur={(e) => saveOnBlur("internal_notes", e.target.value || null)}
              className={`${field} resize-none`}
            />
          </Section>

          {/* ── Customer ── */}
          <Section title="Customer">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name</Label>
                <input
                  type="text"
                  value={local.customer_first_name ?? ""}
                  onChange={(e) => set("customer_first_name", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_first_name", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <input
                  type="text"
                  value={local.customer_last_name ?? ""}
                  onChange={(e) => set("customer_last_name", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_last_name", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <input
                  type="text"
                  value={local.customer_phone ?? ""}
                  onChange={(e) => set("customer_phone", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_phone", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Email</Label>
                  {local.customer_email && (
                    <Link
                      href={`/customers/${encodeURIComponent(local.customer_email)}`}
                      className="text-xs text-[#A3B2A4] font-semibold hover:text-black transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View Customer →
                    </Link>
                  )}
                </div>
                <input
                  type="email"
                  value={local.customer_email ?? ""}
                  onChange={(e) => set("customer_email", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_email", e.target.value || null)}
                  className={field}
                />
              </div>
              <div className="col-span-2">
                <Label>Street</Label>
                <input
                  type="text"
                  value={local.customer_street ?? ""}
                  onChange={(e) => set("customer_street", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_street", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <Label>Suburb</Label>
                <input
                  type="text"
                  value={local.customer_suburb ?? ""}
                  onChange={(e) => set("customer_suburb", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_suburb", e.target.value || null)}
                  className={field}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>State</Label>
                  <input
                    type="text"
                    value={local.customer_state ?? ""}
                    onChange={(e) => set("customer_state", e.target.value)}
                    onBlur={(e) => saveOnBlur("customer_state", e.target.value || null)}
                    className={field}
                  />
                </div>
                <div>
                  <Label>Postcode</Label>
                  <input
                    type="text"
                    value={local.customer_postcode ?? ""}
                    onChange={(e) => set("customer_postcode", e.target.value)}
                    onBlur={(e) => saveOnBlur("customer_postcode", e.target.value || null)}
                    className={field}
                  />
                </div>
              </div>
              {(local.customer_number !== null && local.customer_number !== undefined) && (
                <div>
                  <Label>Customer #</Label>
                  <input
                    type="text"
                    value={local.customer_number ?? ""}
                    onChange={(e) => set("customer_number", e.target.value)}
                    onBlur={(e) => saveOnBlur("customer_number", e.target.value || null)}
                    className={field}
                  />
                </div>
              )}
              {(local.stock_number !== null && local.stock_number !== undefined) && (
                <div>
                  <Label>Stock #</Label>
                  <input
                    type="text"
                    value={local.stock_number ?? ""}
                    onChange={(e) => set("stock_number", e.target.value)}
                    onBlur={(e) => saveOnBlur("stock_number", e.target.value || null)}
                    className={field}
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ── Articles & Instructions ── */}
          <Section title="Articles & Instructions">
            <div className="space-y-3">
              <div>
                <Label>Articles</Label>
                <textarea
                  rows={2}
                  value={local.articles ?? ""}
                  onChange={(e) => set("articles", e.target.value)}
                  onBlur={(e) => saveOnBlur("articles", e.target.value || null)}
                  className={`${field} resize-none`}
                />
              </div>
              <div>
                <Label>Instructions</Label>
                <textarea
                  rows={3}
                  value={local.instructions ?? ""}
                  onChange={(e) => set("instructions", e.target.value)}
                  onBlur={(e) => saveOnBlur("instructions", e.target.value || null)}
                  className={`${field} resize-none`}
                />
              </div>
            </div>
          </Section>

          {/* ── Other Dates ── */}
          <Section title="Other Dates">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>In Date</Label>
                <input
                  type="date"
                  value={local.in_date ?? ""}
                  onChange={(e) => {
                    set("in_date", e.target.value || null);
                    patch({ in_date: e.target.value || null });
                  }}
                  className={field}
                />
              </div>
              <div>
                <Label>From Date</Label>
                <input
                  type="date"
                  value={local.from_date ?? ""}
                  onChange={(e) => {
                    set("from_date", e.target.value || null);
                    patch({ from_date: e.target.value || null });
                  }}
                  className={field}
                />
              </div>
              <div>
                <Label>Collected</Label>
                <input
                  type="date"
                  value={local.collected_date ?? ""}
                  onChange={(e) => {
                    set("collected_date", e.target.value || null);
                    patch({ collected_date: e.target.value || null });
                  }}
                  className={field}
                />
              </div>
            </div>
          </Section>

          {/* ── Pricing ── */}
          <Section title="Pricing">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Total ($)</Label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={local.total_charges ?? ""}
                  onChange={(e) => set("total_charges", e.target.value === "" ? null : parseFloat(e.target.value))}
                  onBlur={(e) => saveOnBlur("total_charges", e.target.value === "" ? null : parseFloat(e.target.value))}
                  className={field}
                />
              </div>
              <div>
                <Label>Deposit ($)</Label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={local.deposit ?? ""}
                  onChange={(e) => set("deposit", e.target.value === "" ? null : parseFloat(e.target.value))}
                  onBlur={(e) => saveOnBlur("deposit", e.target.value === "" ? null : parseFloat(e.target.value))}
                  className={field}
                />
              </div>
              <div>
                <Label>Balance</Label>
                <div className="w-full rounded-lg border border-gray-100 bg-gray-100 px-3 py-2 text-sm text-gray-500 select-none">
                  {(local.total_charges || local.deposit)
                    ? `$${balance.toFixed(2)}`
                    : "—"}
                </div>
              </div>
            </div>
          </Section>

          {/* ── Staff & Referral ── */}
          <Section title="Staff & Referral">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Staff Member</Label>
                <select
                  value={local.staff_member ?? ""}
                  onChange={(e) => {
                    set("staff_member", e.target.value || null);
                    patch({ staff_member: e.target.value || null });
                  }}
                  className={field}
                >
                  <option value="">— Unassigned —</option>
                  {STAFF_MEMBERS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label>Referral Source</Label>
                <input
                  type="text"
                  value={local.referral_source ?? ""}
                  onChange={(e) => set("referral_source", e.target.value)}
                  onBlur={(e) => saveOnBlur("referral_source", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <Label>Occasion</Label>
                <input
                  type="text"
                  value={local.occasion ?? ""}
                  onChange={(e) => set("occasion", e.target.value)}
                  onBlur={(e) => saveOnBlur("occasion", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <Label>Repair Tracker #</Label>
                <input
                  type="text"
                  value={local.repair_tracker_number ?? ""}
                  onChange={(e) => set("repair_tracker_number", e.target.value)}
                  onBlur={(e) => saveOnBlur("repair_tracker_number", e.target.value || null)}
                  className={field}
                />
              </div>
              <div>
                <Label>Signed By</Label>
                <input
                  type="text"
                  value={local.signed_by ?? ""}
                  onChange={(e) => set("signed_by", e.target.value)}
                  onBlur={(e) => saveOnBlur("signed_by", e.target.value || null)}
                  className={field}
                />
              </div>
            </div>
          </Section>

          {/* ── Online Order ── */}
          {isOnline && (
            <Section title="Online Order">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Order #</Label>
                  <input
                    type="text"
                    value={local.order_number ?? ""}
                    onChange={(e) => set("order_number", e.target.value)}
                    onBlur={(e) => saveOnBlur("order_number", e.target.value || null)}
                    className={field}
                  />
                </div>
                <div>
                  <Label>Order Source</Label>
                  <input
                    type="text"
                    value={local.order_source ?? ""}
                    onChange={(e) => set("order_source", e.target.value)}
                    onBlur={(e) => saveOnBlur("order_source", e.target.value || null)}
                    className={field}
                  />
                </div>
                <div>
                  <Label>Shipping Method</Label>
                  <input
                    type="text"
                    value={local.shipping_method ?? ""}
                    onChange={(e) => set("shipping_method", e.target.value)}
                    onBlur={(e) => saveOnBlur("shipping_method", e.target.value || null)}
                    className={field}
                  />
                </div>
                <div>
                  <Label>Tracking #</Label>
                  <input
                    type="text"
                    value={local.tracking_number ?? ""}
                    onChange={(e) => set("tracking_number", e.target.value)}
                    onBlur={(e) => saveOnBlur("tracking_number", e.target.value || null)}
                    className={field}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Items Ordered</Label>
                  <textarea
                    rows={2}
                    value={local.items_ordered ?? ""}
                    onChange={(e) => set("items_ordered", e.target.value)}
                    onBlur={(e) => saveOnBlur("items_ordered", e.target.value || null)}
                    className={`${field} resize-none`}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Order Notes</Label>
                  <textarea
                    rows={2}
                    value={local.order_notes ?? ""}
                    onChange={(e) => set("order_notes", e.target.value)}
                    onBlur={(e) => saveOnBlur("order_notes", e.target.value || null)}
                    className={`${field} resize-none`}
                  />
                </div>
                {!local.shipping_address_same && (
                  <>
                    <div className="col-span-2">
                      <Label>Shipping Street</Label>
                      <input
                        type="text"
                        value={local.shipping_street ?? ""}
                        onChange={(e) => set("shipping_street", e.target.value)}
                        onBlur={(e) => saveOnBlur("shipping_street", e.target.value || null)}
                        className={field}
                      />
                    </div>
                    <div>
                      <Label>Shipping Suburb</Label>
                      <input
                        type="text"
                        value={local.shipping_suburb ?? ""}
                        onChange={(e) => set("shipping_suburb", e.target.value)}
                        onBlur={(e) => saveOnBlur("shipping_suburb", e.target.value || null)}
                        className={field}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label>State</Label>
                        <input
                          type="text"
                          value={local.shipping_state ?? ""}
                          onChange={(e) => set("shipping_state", e.target.value)}
                          onBlur={(e) => saveOnBlur("shipping_state", e.target.value || null)}
                          className={field}
                        />
                      </div>
                      <div>
                        <Label>Postcode</Label>
                        <input
                          type="text"
                          value={local.shipping_postcode ?? ""}
                          onChange={(e) => set("shipping_postcode", e.target.value)}
                          onBlur={(e) => saveOnBlur("shipping_postcode", e.target.value || null)}
                          className={field}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Section>
          )}

          {/* ── Additional packet_data (read-only) ── */}
          {local.packet_data && Object.keys(local.packet_data).length > 0 && (
            <Section title="Additional Details">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                {Object.entries(local.packet_data).map(([k, v]) => (
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

      {/* ── Notification modal ── */}
      {notifOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" onClick={closeNotifModal} />

          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-auto p-6 space-y-5">

            {/* Header */}
            <div>
              <h2 className="text-lg font-bold text-black">Send Customer Notification</h2>
              <p className="text-sm text-gray-500 mt-1">
                <span className="font-semibold text-black">
                  {[local.customer_first_name, local.customer_last_name].filter(Boolean).join(" ") || "Unknown"}
                </span>
                {local.customer_phone && (
                  <span className="ml-2 text-gray-400">{local.customer_phone}</span>
                )}
              </p>
            </div>

            {notifStep === "select" && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                  Choose a template
                </p>

                {/* Template buttons */}
                <div className="space-y-3">
                  {(["order_confirmation", "ready_for_pickup"] as Template[]).map((t) => {
                    const label   = t === "order_confirmation" ? "Order Confirmation" : "Ready for Pickup";
                    const preview = buildMessage(t, local);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => selectTemplate(t)}
                        className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-black p-4 transition-colors"
                      >
                        <p className="text-sm font-bold text-black mb-1">{label}</p>
                        <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">{preview}</p>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={closeNotifModal}
                  className="w-full text-sm font-semibold text-gray-500 hover:text-black py-2 transition-colors"
                >
                  Cancel
                </button>
              </>
            )}

            {notifStep === "preview" && notifTemplate && (
              <>
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                    Message Preview
                  </p>
                  <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
                    <p className="text-sm text-black leading-relaxed">
                      {buildMessage(notifTemplate, local)}
                    </p>
                  </div>
                </div>

                {/* Send SMS */}
                <div className="space-y-2">
                  <button
                    onClick={() => handleSend("sms")}
                    disabled={notifSending || !local.customer_phone}
                    title={!local.customer_phone ? "No phone number on file" : undefined}
                    className="w-full flex flex-col items-center justify-center rounded-xl bg-black py-3 text-sm font-bold text-white hover:bg-[#222] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{notifSending ? "Sending…" : "Send SMS"}</span>
                    {local.customer_phone && (
                      <span className="text-xs font-normal text-white/70 mt-0.5">{local.customer_phone}</span>
                    )}
                  </button>

                  {/* Send Email */}
                  <button
                    onClick={() => handleSend("email")}
                    disabled={notifSending || !local.customer_email}
                    title={!local.customer_email ? "No email address on file" : undefined}
                    className="w-full flex flex-col items-center justify-center rounded-xl border-2 border-black py-3 text-sm font-bold text-black hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <span>{notifSending ? "Sending…" : "Send Email"}</span>
                    {local.customer_email && (
                      <span className="text-xs font-normal text-gray-500 mt-0.5">{local.customer_email}</span>
                    )}
                  </button>

                  <button
                    onClick={closeNotifModal}
                    className="w-full rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:text-black hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2 rounded-xl px-5 py-3 shadow-xl text-sm font-semibold text-white transition-all ${
            toast.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.message}
        </div>
      )}
    </div>
  );
}
