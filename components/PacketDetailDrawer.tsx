"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import { useUser } from "@/context/UserContext";
import { Packet, ItemSpecifications } from "@/lib/types";
import { packetTypeLabel, formatDateAU } from "@/lib/formatters";
import { generatePrintHTML } from "@/lib/labelGenerator";
import { printOrderConfirmation } from "@/lib/orderConfirmationGenerator";
import ItemSpecificationsForm from "./ItemSpecificationsForm";
import { generateValuationCertificate } from "@/lib/valuationCertificateGenerator";
import { STAFF_NAMES } from "@/lib/staffList";

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

interface Toast { type: "success" | "error" | "warning"; message: string; }

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
      <p style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12, borderBottom: '1px solid #E8E8F0', paddingBottom: 4 }}>
        {title}
      </p>
      {children}
    </div>
  );
}

function Label({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: bold ? 600 : 500, color: bold ? '#1A1A2E' : '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
      {children}
    </label>
  );
}

export default function PacketDetailDrawer({ packet, onClose, onDelete, onUpdate }: Props) {
  const { user } = useUser();
  const [local, setLocal] = useState<Packet>(packet);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [reprintLoading, setReprintLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Mark as Collected modal state ────────────────────────────────────────────
  const [collectOpen, setCollectOpen]         = useState(false);
  const [collectCategory, setCollectCategory] = useState("Fine Jewellery");
  const [collectLoading, setCollectLoading]   = useState(false);

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
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
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

  // Dedicated field update — saves to Supabase, updates local state from the
  // server response, and logs confirmation. Use this for fields that must be
  // persisted before a reprint (articles, instructions, etc.).
  async function handleFieldUpdate(field: string, value: unknown) {
    try {
      const res = await fetch(`/api/admin/packets/${local.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ [field]: value }),
      });
      const json = await res.json() as { packet?: Packet };
      if (json.packet) {
        setLocal(json.packet);
        onUpdate(json.packet);
        console.log("[drawer] Saved", field, ":", value);
      }
    } catch (err) {
      console.error("[drawer] handleFieldUpdate failed for", field, err);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!window.confirm(`Delete order ${local.reference_number}? This cannot be undone.`)) return
    console.log('[handleDelete] Starting delete for:', local.id)
    setDeleting(true)
    try {
      const url = `/api/admin/packets/${local.id}`
      console.log('[handleDelete] DELETE', url)
      const res = await fetch(url, { method: 'DELETE', headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      console.log('[handleDelete] Response status:', res.status)
      const json = await res.json()
      console.log('[handleDelete] Response body:', json)
      if (json.success) {
        console.log('[handleDelete] Delete successful')
        onDelete(local.id)
        onClose()
      } else {
        alert('Delete failed: ' + (json.error || 'Unknown error'))
      }
    } catch (err) {
      console.error('[handleDelete] Exception:', err)
      alert('Delete failed: ' + String(err))
    } finally {
      setDeleting(false)
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
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
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

  async function handleReprintLabel() {
    setReprintLoading(true);
    try {
      // ── Step 1: Flush current local state to Supabase BEFORE fetching ──────
      // This guarantees any unsaved edits (articles typed but not yet blurred,
      // due date changes, gift wrapping toggle etc.) are persisted first.
      console.log("[save] Saving articles:", local.articles);
      await fetch(`/api/admin/packets/${local.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({
          articles:         local.articles,
          instructions:     local.instructions,
          due_date:         local.due_date,
          gift_wrapping:    local.gift_wrapping,
          delivery_method:  (local as unknown as { delivery_method?: string | null }).delivery_method,
          shipping_method:  local.shipping_method,
          total_charges:    local.total_charges,
          deposit:          local.deposit,
        }),
      });

      // ── Step 2: Fetch completely fresh data (timestamp busts any CDN/edge cache) ──
      const res = await fetch(
        `/api/admin/packets/${local.id}?t=${Date.now()}`,
        { cache: "no-store", headers: { "Cache-Control": "no-cache", "Pragma": "no-cache", 'x-tenant-id': user?.tenantId ?? '' } }
      );
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const json = await res.json();
      const freshPacket = json.packet;

      if (!freshPacket) {
        alert("Could not load order data. Please try again.");
        return;
      }

      console.log("[fetch] Fresh articles from DB:", freshPacket.articles);

      // ── Step 3: Generate and print from fresh data ──────────────────────────
      const html = generatePrintHTML(freshPacket);
      const win = window.open("", "_blank");
      if (win) {
        win.document.write(html);
        win.document.close();
        setTimeout(() => win.print(), 500);
      }
    } catch (err) {
      console.error("[reprint] Error:", err);
      alert("Reprint failed: " + String(err));
    } finally {
      setReprintLoading(false);
    }
  }

  // ── View Claim Slip ───────────────────────────────────────────────────────
  function handleViewClaimSlip() {
    window.open(`/claim/${local.reference_number}`, "_blank");
  }

  // ── Valuation handlers ────────────────────────────────────────────────────
  async function handleSaveSpecs(specs: ItemSpecifications) {
    await patch({ item_specifications: specs as unknown as Record<string, unknown> });
  }

  async function handleSubmitForReview(specs: ItemSpecifications) {
    await fetch("/api/workshop/valuation", {
      method: "POST",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ packet_id: local.id, item_specifications: specs }),
    });
    setLocal((prev) => ({ ...prev, valuation_status: "pending_review", item_specifications: specs as unknown as Record<string, unknown> }));
  }

  async function handleApproveValuation(specs: ItemSpecifications, erv: number) {
    console.log("[PacketDetailDrawer] handleApproveValuation called", { packetId: local.id, erv });
    const res = await fetch("/api/workshop/valuation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ packet_id: local.id, item_specifications: specs, estimated_replacement_value: erv }),
    });
    const json = await res.json() as { packet: typeof local; error?: string };
    if (!res.ok) {
      const errMsg = json.error ?? `Server error ${res.status}`;
      console.error("[PacketDetailDrawer] Approve valuation failed:", errMsg);
      setToast({ type: "error", message: `Approval failed: ${errMsg}` });
      throw new Error(errMsg); // propagates to ItemSpecificationsForm's catch block
    }
    if (json.packet) {
      setLocal(json.packet);
      onUpdate(json.packet);
      setToast({ type: "success", message: "✓ Valuation approved — opening certificate…" });
      generateValuationCertificate(json.packet);
    }
  }

  // ── Auto-detect product category from articles text ──────────────────────────
  function detectCategory(articles: string | null): string {
    const text = (articles ?? "").toLowerCase();
    if (text.includes("engagement")) return "Engagement Ring";
    if (text.includes("wedding") || text.includes("wedder") || text.includes("wed. ring")) return "Wedding Ring";
    if (text.includes("eternity")) return "Eternity Ring";
    if (text.includes("dress ring")) return "Dress Ring";
    return "Fine Jewellery";
  }

  // ── Mark as Collected handler ─────────────────────────────────────────────────
  async function handleMarkCollected() {
    setCollectLoading(true);
    const today = new Date().toISOString().split("T")[0];
    try {
      // 1. Patch Supabase — save collected_date and product_category
      const patchRes = await fetch(`/api/admin/packets/${local.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ collected_date: today, product_category: collectCategory }),
      });
      if (!patchRes.ok) throw new Error("Failed to save collected date");
      const patchJson = await patchRes.json() as { packet: Packet };
      if (patchJson.packet) {
        setLocal(patchJson.packet);
        onUpdate(patchJson.packet);
      }

      // 2. Close modal before Klaviyo call (keeps UX snappy)
      setCollectOpen(false);

      // 3. Sync to Klaviyo — failure is non-fatal
      let klaviyoOk = false;
      try {
        const klaviyoRes = await fetch("/api/klaviyo/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
          body: JSON.stringify({
            customer_email:      local.customer_email,
            customer_phone:      local.customer_phone,
            customer_first_name: local.customer_first_name,
            customer_last_name:  local.customer_last_name,
            product_category:    collectCategory,
            total_charges:       local.total_charges,
            reference_number:    local.reference_number,
            collected_date:      today,
            staff_member:        local.staff_member,
          }),
        });
        klaviyoOk = klaviyoRes.ok;
      } catch (klaviyoErr) {
        console.error("[drawer] Klaviyo sync threw:", klaviyoErr);
        klaviyoOk = false;
      }

      if (klaviyoOk) {
        setToast({ type: "success", message: "✓ Synced to Klaviyo" });
      } else {
        setToast({ type: "warning", message: "Collected saved — Klaviyo sync failed" });
      }
    } catch (err) {
      console.error("[drawer] handleMarkCollected:", err);
      setCollectOpen(false);
      setToast({ type: "error", message: "Failed to save collected date" });
    } finally {
      setCollectLoading(false);
    }
  }

  // Compute displayed balance
  const balance = (local.total_charges ?? 0) - (local.deposit ?? 0);

  const fieldStyle: React.CSSProperties = {
    width: '100%', border: '1px solid #E8E8F0', borderRadius: 8,
    background: '#fff', fontSize: 14, padding: '0 12px', color: '#1A1A2E',
    outline: 'none', height: 40, fontFamily: 'inherit',
  };

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
      <div className="flex-1" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={onClose} />

      {/* Drawer */}
      <div style={{ width: 480, background: '#FFFFFF', borderLeft: '1px solid #E8E8F0', boxShadow: '-4px 0 24px rgba(0,0,0,0.08)' }} className="overflow-y-auto flex flex-col">

        {/* Header */}
        <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E8E8F0', padding: 20 }} className="flex items-center justify-between sticky top-0 z-10">
          <div>
            <p style={{ fontSize: 12, color: '#6B7280', marginBottom: 2 }}>{packetTypeLabel(local.packet_type)}</p>
            <h2 style={{ fontFamily: 'monospace', fontSize: 16, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>{local.reference_number}</h2>
          </div>
          <div className="flex items-center gap-3">
            {saveIndicator}
            <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 8, borderRadius: '50%' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#F3F4F6'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}>
              <svg className="w-5 h-5" style={{ color: '#6B7280' }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div style={{ flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* ── DISPATCH DATE (online orders) — top hero, purple border ── */}
          {isOnline && (
            <div style={{ borderRadius: 12, border: '2px solid #635BFF', background: '#FFFFFF', padding: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: '#635BFF', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>📦 Dispatch Date</p>
              <input
                type="date"
                value={local.due_date ? local.due_date.split("T")[0] : ""}
                onChange={(e) => set("due_date", e.target.value || null)}
                onBlur={(e) => patch({ due_date: e.target.value || null })}
                style={{ width: '100%', border: '1px solid #E8E8F0', borderRadius: 8, background: '#F9FAFB', padding: '12px 16px', fontSize: 18, fontWeight: 700, color: '#635BFF', outline: 'none' }}
              />
            </div>
          )}

          {/* ── Action buttons: Reprint + Send Notification ── */}
          <div className={`grid gap-2 ${showNotifButton ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              onClick={async () => { console.log('REPRINT BUTTON CLICKED'); await handleReprintLabel(); }}
              disabled={reprintLoading}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#EEF2FF', color: '#635BFF', fontSize: 14, fontWeight: 600, padding: '12px', borderRadius: 12, border: 'none', cursor: reprintLoading ? 'not-allowed' : 'pointer', opacity: reprintLoading ? 0.6 : 1, transition: 'all .15s', width: '100%' }}
              onMouseEnter={e => { if (!reprintLoading) (e.currentTarget as HTMLButtonElement).style.background = '#E0E7FF'; }}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF'}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              {reprintLoading ? "Loading…" : "Reprint Label"}
            </button>

            {showNotifButton && (
              <button
                onClick={openNotifModal}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#635BFF', color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', transition: 'background .15s', width: '100%' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#4F46E5'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#635BFF'}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                </svg>
                Send Notification
              </button>
            )}
          </div>

          {/* ── View Claim Slip (repair / custom_order only) ── */}
          {(local.packet_type === "repair" || local.packet_type === "custom_order") && (
            <div>
              <button
                onClick={handleViewClaimSlip}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: '#EEF2FF', color: '#635BFF', fontSize: 14, fontWeight: 600, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#E0E7FF'}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF'}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View Claim Slip
              </button>
              {local.claim_slip_sent_at && (
                <p style={{ textAlign: 'center', fontSize: 12, color: '#16A34A', marginTop: 6, fontWeight: 500 }}>
                  ✓ Sent with order confirmation{local.claim_slip_sent_at ? ` · ${formatDateAU(local.claim_slip_sent_at.split("T")[0])}` : ""}
                </p>
              )}
            </div>
          )}

          {/* ── Mark as Collected (custom_order only, hidden once collected) ── */}
          {local.packet_type === "custom_order" && !local.collected_date && (
            <button
              onClick={() => {
                setCollectCategory(detectCategory(local.articles));
                setCollectOpen(true);
              }}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', background: '#10B981', color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', transition: 'background .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#059669'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#10B981'}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Mark as Collected
            </button>
          )}
          {local.packet_type === "custom_order" && local.collected_date && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 12, background: '#ECFDF5', border: '1px solid #6EE7B7', color: '#059669', fontSize: 14, fontWeight: 600 }}>
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              Collected {formatDateAU(local.collected_date)}
              {local.product_category && (
                <span style={{ marginLeft: 4, fontSize: 12, color: '#6EE7B7', fontWeight: 500 }}>· {local.product_category}</span>
              )}
            </div>
          )}

          {/* ── Print Confirmation (full-width, outline style) ── */}
          <button
            onClick={() => printOrderConfirmation(local)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', border: '1px solid #E8E8F0', color: '#6B7280', fontSize: 14, fontWeight: 600, padding: '10px', borderRadius: 12, background: '#fff', cursor: 'pointer', transition: 'all .15s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#D1D5DB'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#fff'; (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E8F0'; }}
          >
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
            Print Confirmation
          </button>

          {local.valuation_status === "approved" && (
            <button
              onClick={() => generateValuationCertificate(local)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', border: '1px solid #635BFF', color: '#635BFF', fontSize: 14, fontWeight: 600, padding: '10px', borderRadius: 12, background: '#fff', cursor: 'pointer', transition: 'all .15s' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF'}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#fff'}
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75l3 3m0 0l3-3m-3 3v-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Print Valuation Certificate
            </button>
          )}

          {/* ── DUE DATE (non-online orders) — purple hero ── */}
          {!isOnline && (
            <div style={{ borderRadius: 12, background: '#635BFF', padding: 16 }}>
              <p style={{ fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.8)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Due Date</p>
              <input
                type="date"
                value={local.due_date ? local.due_date.split("T")[0] : ""}
                onChange={(e) => set("due_date", e.target.value || null)}
                onBlur={(e) => patch({ due_date: e.target.value || null })}
                style={{ width: '100%', border: 0, borderRadius: 8, background: '#FFFFFF', padding: '12px 16px', fontSize: 18, fontWeight: 700, color: '#1A1A2E', outline: 'none' }}
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
              style={{ ...fieldStyle, height: 'auto', padding: '8px 12px', minHeight: 72, resize: 'vertical' as const }}
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
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label>Last Name</Label>
                <input
                  type="text"
                  value={local.customer_last_name ?? ""}
                  onChange={(e) => set("customer_last_name", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_last_name", e.target.value || null)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label>Phone</Label>
                <input
                  type="text"
                  value={local.customer_phone ?? ""}
                  onChange={(e) => set("customer_phone", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_phone", e.target.value || null)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label>Email</Label>
                  {local.customer_email && (
                    <Link
                      href={`/customers/${encodeURIComponent(local.customer_email)}`}
                      style={{ fontSize: 12, color: '#635BFF', fontWeight: 600, textDecoration: 'none' }}
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
                  style={fieldStyle}
                />
              </div>
              <div className="col-span-2">
                <Label>Street</Label>
                <input
                  type="text"
                  value={local.customer_street ?? ""}
                  onChange={(e) => set("customer_street", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_street", e.target.value || null)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label>Suburb</Label>
                <input
                  type="text"
                  value={local.customer_suburb ?? ""}
                  onChange={(e) => set("customer_suburb", e.target.value)}
                  onBlur={(e) => saveOnBlur("customer_suburb", e.target.value || null)}
                  style={fieldStyle}
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
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <Label>Postcode</Label>
                  <input
                    type="text"
                    value={local.customer_postcode ?? ""}
                    onChange={(e) => set("customer_postcode", e.target.value)}
                    onBlur={(e) => saveOnBlur("customer_postcode", e.target.value || null)}
                    style={fieldStyle}
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
                    style={fieldStyle}
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
                    style={fieldStyle}
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
                  onChange={(e) => {
                    console.log("[textarea] onChange:", e.target.value);
                    set("articles", e.target.value);
                  }}
                  onBlur={(e) => handleFieldUpdate("articles", e.target.value || null)}
                  style={{ ...fieldStyle, height: 'auto', padding: '8px 12px', minHeight: 72, resize: 'vertical' as const }}
                />
              </div>
              <div>
                <Label>Instructions</Label>
                <textarea
                  rows={3}
                  value={local.instructions ?? ""}
                  onChange={(e) => set("instructions", e.target.value)}
                  onBlur={(e) => saveOnBlur("instructions", e.target.value || null)}
                  style={{ ...fieldStyle, height: 'auto', padding: '8px 12px', minHeight: 72, resize: 'vertical' as const }}
                />
              </div>
              <div>
                <Label>Gift Wrapping</Label>
                <button
                  type="button"
                  onClick={() => {
                    const next = !(local.gift_wrapping === true || local.gift_wrapping === (true as unknown as boolean));
                    set("gift_wrapping", next);
                    patch({ gift_wrapping: next });
                  }}
                  style={{
                    width: '100%', borderRadius: 8, border: '1px solid',
                    borderColor: (local.gift_wrapping === true || (local.gift_wrapping as unknown) === "true") ? '#635BFF' : '#E8E8F0',
                    background: (local.gift_wrapping === true || (local.gift_wrapping as unknown) === "true") ? '#635BFF' : '#F9FAFB',
                    color: (local.gift_wrapping === true || (local.gift_wrapping as unknown) === "true") ? '#fff' : '#6B7280',
                    padding: '8px 12px', fontSize: 14, fontWeight: 600, textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
                  }}
                >
                  {(local.gift_wrapping === true || (local.gift_wrapping as unknown) === "true") ? "✓ YES — Gift Wrap" : "NO — No Gift Wrap"}
                </button>
              </div>
              {(local.packet_type === 'repair' || local.packet_type === 'custom_order') && (
                <div>
                  <Label>Delivery Method</Label>
                  <select
                    value={local.delivery_method ?? 'Pickup'}
                    onChange={(e) => {
                      set('delivery_method', e.target.value as Packet['delivery_method']);
                      patch({ delivery_method: e.target.value });
                    }}
                    style={{ width: '100%', borderRadius: 8, border: '1px solid #E8E8F0', background: '#F9FAFB', padding: '8px 12px', fontSize: 14, color: '#1A1A2E', cursor: 'pointer' }}
                  >
                    <option value="Pickup">Pickup</option>
                    <option value="Standard Post">Standard Post</option>
                    <option value="Express Post">Express Post</option>
                    <option value="Courier">Courier</option>
                  </select>
                </div>
              )}
              {(local.packet_type === 'repair' || local.packet_type === 'custom_order' || local.packet_type === 'online_order') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <Label>Carat Weight (ct)</Label>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={local.carat_weight ?? ""}
                      onChange={(e) => set("carat_weight", e.target.value ? parseFloat(e.target.value) : null)}
                      onBlur={(e) => patch({ carat_weight: e.target.value ? parseFloat(e.target.value) : null })}
                      placeholder="e.g. 1.5"
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <Label>Metal Colour</Label>
                    <select
                      value={local.metal_colour ?? ""}
                      onChange={(e) => {
                        set("metal_colour", e.target.value || null);
                        patch({ metal_colour: e.target.value || null });
                      }}
                      style={{ width: '100%', borderRadius: 8, border: '1px solid #E8E8F0', background: '#F9FAFB', padding: '8px 12px', fontSize: 14, color: '#1A1A2E', cursor: 'pointer' }}
                    >
                      <option value="">— Select —</option>
                      <option>Yellow Gold</option>
                      <option>White Gold</option>
                      <option>Rose Gold</option>
                      <option>Sterling Silver</option>
                      <option>Platinum</option>
                      <option>Two-Tone</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>
              )}
              {/* Valuation Required toggle — shown for repair and custom orders */}
              {(local.packet_type === 'repair' || local.packet_type === 'custom_order') && (
                <div>
                  <Label>Valuation Required</Label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !local.valuation_required;
                      set("valuation_required", next);
                      patch({ valuation_required: next });
                    }}
                    style={{
                      width: '100%', borderRadius: 8, border: '1px solid',
                      borderColor: local.valuation_required ? '#D97706' : '#E8E8F0',
                      background: local.valuation_required ? '#FEF3C7' : '#F9FAFB',
                      color: local.valuation_required ? '#92400E' : '#6B7280',
                      padding: '8px 12px', fontSize: 14, fontWeight: 700, textAlign: 'left' as const,
                      cursor: 'pointer', transition: 'all .15s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z" />
                    </svg>
                    {local.valuation_required ? "YES — Valuation Required" : "NO — No Valuation"}
                  </button>
                </div>
              )}
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
                  style={fieldStyle}
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
                  style={fieldStyle}
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
                  style={fieldStyle}
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
                  style={fieldStyle}
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
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label>Balance</Label>
                <div style={{ width: '100%', borderRadius: 8, border: '1px solid #E8E8F0', background: '#F9FAFB', padding: '8px 12px', fontSize: 14, color: '#6B7280' }} className="select-none">
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
                  style={fieldStyle}
                >
                  <option value="">— Unassigned —</option>
                  {STAFF_NAMES.map((s) => (
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
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label>Occasion</Label>
                <input
                  type="text"
                  value={local.occasion ?? ""}
                  onChange={(e) => set("occasion", e.target.value)}
                  onBlur={(e) => saveOnBlur("occasion", e.target.value || null)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label>Repair Tracker #</Label>
                <input
                  type="text"
                  value={local.repair_tracker_number ?? ""}
                  onChange={(e) => set("repair_tracker_number", e.target.value)}
                  onBlur={(e) => saveOnBlur("repair_tracker_number", e.target.value || null)}
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label>Signed By</Label>
                <input
                  type="text"
                  value={local.signed_by ?? ""}
                  onChange={(e) => set("signed_by", e.target.value)}
                  onBlur={(e) => saveOnBlur("signed_by", e.target.value || null)}
                  style={fieldStyle}
                />
              </div>
            </div>
          </Section>

          {/* ── Specifications & Valuation (repair / custom_order only) ── */}
          {(local.packet_type === "repair" || local.packet_type === "custom_order") && (
            <ItemSpecificationsForm
              packetId={local.id}
              specs={local.item_specifications as ItemSpecifications | null}
              valuationStatus={local.valuation_status ?? null}
              onSave={handleSaveSpecs}
              onSubmitForReview={handleSubmitForReview}
              onApprove={handleApproveValuation}
              isSam={true}
            />
          )}

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
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <Label>Order Source</Label>
                  <input
                    type="text"
                    value={local.order_source ?? ""}
                    onChange={(e) => set("order_source", e.target.value)}
                    onBlur={(e) => saveOnBlur("order_source", e.target.value || null)}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <Label>Shipping Method</Label>
                  <input
                    type="text"
                    value={local.shipping_method ?? ""}
                    onChange={(e) => set("shipping_method", e.target.value)}
                    onBlur={(e) => saveOnBlur("shipping_method", e.target.value || null)}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <Label>Tracking #</Label>
                  <input
                    type="text"
                    value={local.tracking_number ?? ""}
                    onChange={(e) => set("tracking_number", e.target.value)}
                    onBlur={(e) => saveOnBlur("tracking_number", e.target.value || null)}
                    style={fieldStyle}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Items Ordered</Label>
                  <textarea
                    rows={2}
                    value={local.items_ordered ?? ""}
                    onChange={(e) => set("items_ordered", e.target.value)}
                    onBlur={(e) => saveOnBlur("items_ordered", e.target.value || null)}
                    style={{ ...fieldStyle, height: 'auto', padding: '8px 12px', minHeight: 72, resize: 'vertical' as const }}
                  />
                </div>
                <div className="col-span-2">
                  <Label>Order Notes</Label>
                  <textarea
                    rows={2}
                    value={local.order_notes ?? ""}
                    onChange={(e) => set("order_notes", e.target.value)}
                    onBlur={(e) => saveOnBlur("order_notes", e.target.value || null)}
                    style={{ ...fieldStyle, height: 'auto', padding: '8px 12px', minHeight: 72, resize: 'vertical' as const }}
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
                        style={fieldStyle}
                      />
                    </div>
                    <div>
                      <Label>Shipping Suburb</Label>
                      <input
                        type="text"
                        value={local.shipping_suburb ?? ""}
                        onChange={(e) => set("shipping_suburb", e.target.value)}
                        onBlur={(e) => saveOnBlur("shipping_suburb", e.target.value || null)}
                        style={fieldStyle}
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
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        <Label>Postcode</Label>
                        <input
                          type="text"
                          value={local.shipping_postcode ?? ""}
                          onChange={(e) => set("shipping_postcode", e.target.value)}
                          onBlur={(e) => saveOnBlur("shipping_postcode", e.target.value || null)}
                          style={fieldStyle}
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
                    <dt style={{ fontSize: 11, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                      {k.replace(/_/g, " ")}
                    </dt>
                    <dd style={{ fontSize: 14, color: '#1A1A2E', marginTop: 2 }}>
                      {Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Yes" : "No") : String(v ?? "")}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          <p style={{ fontSize: 12, color: '#9CA3AF' }}>
            Created {new Date(local.created_at).toLocaleString("en-AU")}
          </p>

          {/* ── Delete ── */}
          <div className="pt-2 pb-4">
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#EF4444', color: '#fff', fontSize: 14, fontWeight: 600, padding: '12px', borderRadius: 12, border: 'none', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.5 : 1, transition: 'background .15s' }}
              onMouseEnter={e => { if (!deleting) (e.currentTarget as HTMLButtonElement).style.background = '#DC2626'; }}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#EF4444'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
              {deleting ? "Deleting…" : "Delete Order"}
            </button>
          </div>

        </div>
      </div>

      {/* ── Mark as Collected modal ── */}
      {collectOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={() => { if (!collectLoading) setCollectOpen(false); }} />
          <div style={{ position: 'relative', background: '#FFFFFF', borderRadius: 16, boxShadow: '0 18px 40px rgba(0,0,0,0.12)', width: '100%', maxWidth: 360, margin: '0 auto', padding: 24 }} className="space-y-5">

            {/* Header */}
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>Mark as Collected</h2>
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                <span style={{ fontWeight: 600, color: '#1A1A2E' }}>
                  {[local.customer_first_name, local.customer_last_name].filter(Boolean).join(" ") || "Unknown"}
                </span>
                <span style={{ marginLeft: 8, fontFamily: 'monospace', fontSize: 12, color: '#9CA3AF' }}>{local.reference_number}</span>
              </p>
            </div>

            {/* Category picker */}
            <div>
              <p style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                Product Category
              </p>
              <select
                value={collectCategory}
                onChange={(e) => setCollectCategory(e.target.value)}
                style={{ width: '100%', borderRadius: 8, border: '1px solid #E8E8F0', background: '#F9FAFB', padding: '10px 12px', fontSize: 14, color: '#1A1A2E', cursor: 'pointer', outline: 'none' }}
              >
                <option>Engagement Ring</option>
                <option>Wedding Ring</option>
                <option>Dress Ring</option>
                <option>Eternity Ring</option>
                <option>Fine Jewellery</option>
              </select>
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 6 }}>Auto-detected from articles — change if incorrect</p>
            </div>

            {/* Actions */}
            <div className="space-y-2">
              <button
                onClick={handleMarkCollected}
                disabled={collectLoading}
                style={{ width: '100%', borderRadius: 12, background: '#10B981', padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', border: 'none', cursor: collectLoading ? 'not-allowed' : 'pointer', opacity: collectLoading ? 0.7 : 1, transition: 'background .15s' }}
                onMouseEnter={e => { if (!collectLoading) (e.currentTarget as HTMLButtonElement).style.background = '#059669'; }}
                onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#10B981'}
              >
                {collectLoading ? "Saving…" : "Confirm Collection"}
              </button>
              <button
                onClick={() => setCollectOpen(false)}
                disabled={collectLoading}
                style={{ width: '100%', borderRadius: 12, border: '1px solid #E8E8F0', padding: '10px', fontSize: 14, fontWeight: 600, color: '#6B7280', background: '#fff', cursor: collectLoading ? 'not-allowed' : 'pointer', transition: 'all .15s' }}
                onMouseEnter={e => { if (!collectLoading) { (e.currentTarget as HTMLButtonElement).style.color = '#1A1A2E'; (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'; } }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Notification modal ── */}
      {notifOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={closeNotifModal} />

          <div style={{ position: 'relative', background: '#FFFFFF', borderRadius: 16, boxShadow: '0 18px 40px rgba(0,0,0,0.12)', width: '100%', maxWidth: 360, margin: '0 auto', padding: 24 }} className="space-y-5">

            {/* Header */}
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>Send Customer Notification</h2>
              <p style={{ fontSize: 14, color: '#6B7280' }}>
                <span style={{ fontWeight: 600, color: '#1A1A2E' }}>
                  {[local.customer_first_name, local.customer_last_name].filter(Boolean).join(" ") || "Unknown"}
                </span>
                {local.customer_phone && (
                  <span style={{ marginLeft: 8, color: '#9CA3AF' }}>{local.customer_phone}</span>
                )}
              </p>
            </div>

            {notifStep === "select" && (
              <>
                <p style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
                        style={{ width: '100%', textAlign: 'left', borderRadius: 12, border: '2px solid #E8E8F0', padding: 16, background: '#fff', cursor: 'pointer', transition: 'border-color .15s' }}
                        onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.borderColor = '#635BFF'}
                        onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.borderColor = '#E8E8F0'}
                      >
                        <p style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', marginBottom: 4 }}>{label}</p>
                        <p style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.5 }} className="line-clamp-3">{preview}</p>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={closeNotifModal}
                  style={{ width: '100%', fontSize: 14, fontWeight: 600, color: '#6B7280', padding: '8px', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color .15s' }}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = '#1A1A2E'}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'}
                >
                  Cancel
                </button>
              </>
            )}

            {notifStep === "preview" && notifTemplate && (
              <>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Message Preview
                  </p>
                  <div style={{ borderRadius: 12, background: '#F9FAFB', border: '1px solid #E8E8F0', padding: '12px 16px' }}>
                    <p style={{ fontSize: 14, color: '#1A1A2E', lineHeight: 1.5 }}>
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
                    style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12, background: '#635BFF', padding: '12px', fontSize: 14, fontWeight: 700, color: '#fff', border: 'none', cursor: (!local.customer_phone || notifSending) ? 'not-allowed' : 'pointer', opacity: (!local.customer_phone || notifSending) ? 0.4 : 1, transition: 'background .15s' }}
                    onMouseEnter={e => { if (local.customer_phone && !notifSending) (e.currentTarget as HTMLButtonElement).style.background = '#4F46E5'; }}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#635BFF'}
                  >
                    <span>{notifSending ? "Sending…" : "Send SMS"}</span>
                    {local.customer_phone && (
                      <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>{local.customer_phone}</span>
                    )}
                  </button>

                  {/* Send Email */}
                  <button
                    onClick={() => handleSend("email")}
                    disabled={notifSending || !local.customer_email}
                    title={!local.customer_email ? "No email address on file" : undefined}
                    style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12, border: '2px solid #635BFF', padding: '12px', fontSize: 14, fontWeight: 700, color: '#635BFF', background: '#fff', cursor: (!local.customer_email || notifSending) ? 'not-allowed' : 'pointer', opacity: (!local.customer_email || notifSending) ? 0.4 : 1, transition: 'all .15s' }}
                    onMouseEnter={e => { if (local.customer_email && !notifSending) (e.currentTarget as HTMLButtonElement).style.background = '#EEF2FF'; }}
                    onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#fff'}
                  >
                    <span>{notifSending ? "Sending…" : "Send Email"}</span>
                    {local.customer_email && (
                      <span style={{ fontSize: 12, fontWeight: 400, color: '#6B7280', marginTop: 2 }}>{local.customer_email}</span>
                    )}
                  </button>

                  <button
                    onClick={closeNotifModal}
                    style={{ width: '100%', borderRadius: 12, border: '1px solid #E8E8F0', padding: '10px', fontSize: 14, fontWeight: 600, color: '#6B7280', background: '#fff', cursor: 'pointer', transition: 'all .15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = '#1A1A2E'; (e.currentTarget as HTMLButtonElement).style.background = '#F9FAFB'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = '#6B7280'; (e.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
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
          style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 70, display: 'flex', alignItems: 'center', gap: 8, borderRadius: 12, padding: '12px 20px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', fontSize: 14, fontWeight: 600, color: '#fff', background: toast.type === 'success' ? '#10B981' : toast.type === 'warning' ? '#D97706' : '#EF4444' }}
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
