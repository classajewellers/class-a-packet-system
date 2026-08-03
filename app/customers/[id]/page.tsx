"use client";

export const dynamic = 'force-dynamic';

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Packet, Quote } from "@/lib/types";
import { packetTypeLabel, formatDateAU, formatCurrency } from "@/lib/formatters";
import PacketDetailDrawer from "@/components/PacketDetailDrawer";
import { useUser } from "@/context/UserContext";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "orders" | "quotes" | "timeline" | "notes" | "partners" | "wishlist" | "appointments" | "followup" | "sms";

interface SmsMessage {
  id: string;
  direction: "in" | "out";
  body: string;
  sent_at: string;
  staff_id: string | null;
  read_at: string | null;
}

const TYPE_BADGE: Record<string, React.CSSProperties> = {
  repair:        { background: '#FEF3C7', color: '#92400E' },
  custom_order:  { background: '#EEF2FF', color: '#635BFF' },
  layby:         { background: '#DBEAFE', color: '#1E40AF' },
  client_intake: { background: '#DCFCE7', color: '#166534' },
  online_order:  { background: '#DCFCE7', color: '#166534' },
};
const STAGE_BADGE: Record<string, React.CSSProperties> = {
  pending:      { background: '#F3F4F6', color: '#374151' },
  follow_up_1:  { background: '#DBEAFE', color: '#1E40AF' },
  follow_up_2:  { background: '#FEF3C7', color: '#92400E' },
  job_won:      { background: '#DCFCE7', color: '#166534' },
  job_lost:     { background: '#FEE2E2', color: '#991B1B' },
};
const DEF_BADGE: React.CSSProperties = { background: '#F3F4F6', color: '#374151' };

interface CustomerData {
  email: string;
  phone: string | null;
  first_name: string | null;
  last_name: string | null;
  maiden_name: string | null;
  street: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  notes: string | null;
  wishlist_notes: string | null;
  customer_followup_notes: string | null;
  customer_id: string | null;
  total_orders: number;
  total_quotes: number;
  total_spend: number;
  first_seen: string;
  last_visit: string;
}

interface EditForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  suburb: string;
  state: string;
  postcode: string;
}

interface Partner {
  id: string;
  partner_email: string;
  partner_name: string | null;
}

interface Appointment {
  id: string;
  appointment_date: string;
  appointment_time: string | null;
  notes: string | null;
  status: string;
}

interface TimelineEvent {
  date: string;
  type: "order" | "quote";
  label: string;
  description: string;
  amount: number | null;
  ref: string;
  status: string;
}

// ── VIP tier ─────────────────────────────────────────────────────────────────

// ── Sub-components ────────────────────────────────────────────────────────────

function StatPill({ label, value, accent }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: '12px 16px', background: accent ? '#635BFF' : '#F9FAFB', border: accent ? 'none' : '1px solid #E8E8F0' }}>
      <span style={{ fontSize: 20, fontWeight: 700, color: accent ? '#fff' : '#1A1A2E' }}>{value}</span>
      <span style={{ fontSize: 12, fontWeight: 500, marginTop: 2, color: accent ? 'rgba(255,255,255,0.7)' : '#6B7280' }}>{label}</span>
    </div>
  );
}

function TabButton({ label, active, onClick, count }: { label: string; active: boolean; onClick: () => void; count?: number }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', fontSize: 13, fontWeight: 600, background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? '#635BFF' : 'transparent'}`, color: active ? '#635BFF' : '#6B7280', cursor: 'pointer', whiteSpace: 'nowrap', marginBottom: -1 }}
    >
      {label}
      {count != null && count > 0 && (
        <span style={{ fontSize: 11, borderRadius: 999, padding: '2px 6px', fontWeight: 700, background: active ? '#635BFF' : '#F3F4F6', color: active ? '#fff' : '#6B7280' }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerProfilePage({ params }: { params: { id: string } }) {
  const { user, hydrated } = useUser();
  const router = useRouter();
  const email = decodeURIComponent(params.id);

  // Core data
  const [customer, setCustomer] = useState<CustomerData | null>(null);
  const [packets, setPackets] = useState<Packet[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [vipTier, setVipTier] = useState<{ tier_name: string; colour: string } | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("orders");
  const [selectedPacket, setSelectedPacket] = useState<Packet | null>(null);

  // Edit form
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>({ first_name: "", last_name: "", email: "", phone: "", street: "", suburb: "", state: "", postcode: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Notes
  const [notes, setNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeTabRef = useRef<Tab>("orders");

  // Maiden name
  const [maidenName, setMaidenName] = useState("");
  const [maidenNameSaving, setMaidenNameSaving] = useState(false);

  // Partners
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnersLoaded, setPartnersLoaded] = useState(false);
  const [partnerQuery, setPartnerQuery] = useState("");
  const [partnerResults, setPartnerResults] = useState<{ email: string; first_name: string | null; last_name: string | null }[]>([]);
  const [partnerSearching, setPartnerSearching] = useState(false);
  const [linkingPartner, setLinkingPartner] = useState<string | null>(null);

  // Wishlist
  const [wishlistNotes, setWishlistNotes] = useState("");
  const [wishlistSaving, setWishlistSaving] = useState(false);
  const wishlistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Appointments
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentsLoaded, setAppointmentsLoaded] = useState(false);
  const [newApptDate, setNewApptDate] = useState("");
  const [newApptTime, setNewApptTime] = useState("");
  const [newApptNotes, setNewApptNotes] = useState("");
  const [addingAppt, setAddingAppt] = useState(false);

  // SMS
  const [smsMessages, setSmsMessages] = useState<SmsMessage[]>([]);
  const [smsLoaded, setSmsLoaded] = useState(false);
  const [smsUnread, setSmsUnread] = useState(0);
  const [smsCompose, setSmsCompose] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const smsEndRef = useRef<HTMLDivElement | null>(null);

  // Follow-up
  const [followupNotes, setFollowupNotes] = useState("");
  const [followupSaving, setFollowupSaving] = useState(false);
  const [generatingEmail, setGeneratingEmail] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<string | null>(null);
  const [emailCopied, setEmailCopied] = useState(false);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hydrated) return;
    console.log("[DEBUG customer fetch] user?.tenantId =", JSON.stringify(user?.tenantId), "| user?.role =", JSON.stringify(user?.role), "| hydrated =", hydrated);
    fetch(`/api/customers/${encodeURIComponent(email)}`, { cache: "no-store", headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then(r => r.json())
      .then(json => {
        setCustomer(json.customer ?? null);
        setPackets(json.packets ?? []);
        setQuotes(json.quotes ?? []);
        setNotes(json.customer?.notes ?? "");
        setMaidenName(json.customer?.maiden_name ?? "");
        setWishlistNotes(json.customer?.wishlist_notes ?? "");
        setFollowupNotes(json.customer?.customer_followup_notes ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [email, user?.tenantId, hydrated]);

  useEffect(() => {
    if (!hydrated || !user?.tenantId) return;
    fetch(`/api/vip-tier/customer?emails=${encodeURIComponent(email)}`, {
      headers: { 'x-tenant-id': user.tenantId },
    })
      .then(r => r.json())
      .then(j => setVipTier(j.results?.[email.toLowerCase().trim()] ?? null))
      .catch(() => {});
  }, [email, user?.tenantId, hydrated]); // eslint-disable-line

  // ── Load partners on tab activate ─────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "partners" || partnersLoaded) return;
    fetch(`/api/customers/${encodeURIComponent(email)}/partners`, { headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then(r => r.json())
      .then(json => { setPartners(json.partners ?? []); setPartnersLoaded(true); });
  }, [activeTab, partnersLoaded, email, user?.tenantId]);

  // ── Load appointments on tab activate ────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "appointments" || appointmentsLoaded) return;
    fetch(`/api/customers/${encodeURIComponent(email)}/appointments`, { headers: { 'x-tenant-id': user?.tenantId ?? '' } })
      .then(r => r.json())
      .then(json => { setAppointments(json.appointments ?? []); setAppointmentsLoaded(true); });
  }, [activeTab, appointmentsLoaded, email, user?.tenantId]);

  // ── Keep activeTabRef in sync ─────────────────────────────────────────────
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // ── Load SMS on tab activate ──────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "sms" || smsLoaded || !customer?.customer_id || !user?.tenantId) return;
    fetch(`/api/sms/messages?customer_id=${customer.customer_id}`, {
      headers: { 'x-tenant-id': user.tenantId }
    })
      .then(r => r.json())
      .then(json => {
        const msgs: SmsMessage[] = json.messages ?? [];
        setSmsMessages(msgs);
        setSmsUnread(msgs.filter(m => m.direction === 'in' && !m.read_at).length);
        setSmsLoaded(true);
      });
  }, [activeTab, smsLoaded, customer?.customer_id, user?.tenantId]);

  // ── Mark SMS as read when tab opens ──────────────────────────────────────
  useEffect(() => {
    if (activeTab !== "sms" || !smsLoaded || !customer?.customer_id || !user?.tenantId) return;
    fetch("/api/sms/read", {
      method: "POST",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user.tenantId },
      body: JSON.stringify({ customer_id: customer.customer_id }),
    }).then(() => setSmsUnread(0)).catch(() => {});
  }, [activeTab, smsLoaded, customer?.customer_id, user?.tenantId]);

  // ── SMS realtime subscription ─────────────────────────────────────────────
  useEffect(() => {
    if (!customer?.customer_id || !user?.tenantId) return;
    const sb = createBrowserSupabaseClient();
    const channel = sb.channel(`sms:${customer.customer_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sms_messages", filter: `customer_id=eq.${customer.customer_id}` },
        (payload: { new: Record<string, unknown> }) => {
          const msg = payload.new as unknown as SmsMessage;
          if (msg.direction === "in") {
            setSmsMessages(prev => [...prev, msg]);
            if (activeTabRef.current === "sms") {
              fetch("/api/sms/read", {
                method: "POST",
                headers: { "Content-Type": "application/json", 'x-tenant-id': user.tenantId ?? '' },
                body: JSON.stringify({ customer_id: customer.customer_id }),
              }).catch(() => {});
            } else {
              setSmsUnread(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();
    return () => { sb.removeChannel(channel); };
  }, [customer?.customer_id, user?.tenantId]);

  // ── Auto-scroll SMS thread ────────────────────────────────────────────────
  useEffect(() => {
    if (smsLoaded) smsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [smsMessages, smsLoaded]);

  // ── Auto-dismiss saveError banner after 5 seconds ─────────────────────────
  useEffect(() => {
    if (!saveError) return;
    const t = setTimeout(() => setSaveError(null), 5000);
    return () => clearTimeout(t);
  }, [saveError]);

  // ── Partner search (debounced) ────────────────────────────────────────────
  useEffect(() => {
    if (!partnerQuery.trim()) { setPartnerResults([]); return; }
    const t = setTimeout(async () => {
      setPartnerSearching(true);
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(partnerQuery)}`, { headers: { 'x-tenant-id': user?.tenantId ?? '' } });
        const json = await res.json();
        const linked = new Set(partners.map(p => p.partner_email.toLowerCase()));
        setPartnerResults(
          (json.customers ?? [])
            .filter((c: { email: string }) => c.email.toLowerCase() !== email.toLowerCase() && !linked.has(c.email.toLowerCase()))
            .slice(0, 6)
        );
      } catch { /* noop */ } finally { setPartnerSearching(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [partnerQuery, partners, email, user?.tenantId]);

  // ── Patch helper — throws on non-2xx so callers can surface errors ────────
  async function patch(fields: Record<string, unknown>) {
    const res = await fetch(`/api/customers/${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(body.error ?? `Save failed (${res.status})`);
    }
  }

  function saveNotes(v: string) {
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(async () => {
      setNotesSaving(true);
      try { await patch({ notes: v }); }
      catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save notes"); }
      finally { setNotesSaving(false); }
    }, 800);
  }

  async function saveMaidenName() {
    setMaidenNameSaving(true);
    try { await patch({ maiden_name: maidenName }); }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save maiden name"); }
    finally { setMaidenNameSaving(false); }
  }

  function saveWishlist(v: string) {
    if (wishlistTimer.current) clearTimeout(wishlistTimer.current);
    wishlistTimer.current = setTimeout(async () => {
      setWishlistSaving(true);
      try { await patch({ wishlist_notes: v }); }
      catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save wishlist"); }
      finally { setWishlistSaving(false); }
    }, 800);
  }

  async function saveFollowup() {
    setFollowupSaving(true);
    try { await patch({ customer_followup_notes: followupNotes }); }
    catch (err) { setSaveError(err instanceof Error ? err.message : "Failed to save follow-up notes"); }
    finally { setFollowupSaving(false); }
  }

  async function linkPartner(partnerEmail: string) {
    setLinkingPartner(partnerEmail);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(email)}/partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ partnerEmail }),
      });
      const json = await res.json();
      if (json.partner) { setPartners(prev => [...prev, json.partner]); setPartnerQuery(""); setPartnerResults([]); }
    } catch { /* noop */ } finally { setLinkingPartner(null); }
  }

  async function unlinkPartner(partnerEmail: string) {
    await fetch(`/api/customers/${encodeURIComponent(email)}/partners`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ partnerEmail }),
    });
    setPartners(prev => prev.filter(p => p.partner_email !== partnerEmail));
  }

  async function addAppointment() {
    if (!newApptDate) return;
    setAddingAppt(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(email)}/appointments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({ appointment_date: newApptDate, appointment_time: newApptTime || null, notes: newApptNotes || null }),
      });
      const json = await res.json();
      if (json.appointment) {
        setAppointments(prev => [json.appointment, ...prev]);
        setNewApptDate(""); setNewApptTime(""); setNewApptNotes("");
      }
    } catch { /* noop */ } finally { setAddingAppt(false); }
  }

  async function toggleApptStatus(appt: Appointment) {
    const newStatus = appt.status === "upcoming" ? "completed" : "upcoming";
    await fetch(`/api/customers/${encodeURIComponent(email)}/appointments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ id: appt.id, status: newStatus }),
    });
    setAppointments(prev => prev.map(a => a.id === appt.id ? { ...a, status: newStatus } : a));
  }

  async function deleteAppt(id: string) {
    await fetch(`/api/customers/${encodeURIComponent(email)}/appointments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
      body: JSON.stringify({ id }),
    });
    setAppointments(prev => prev.filter(a => a.id !== id));
  }

  async function generateEmail() {
    if (generatingEmail) return;
    setGeneratingEmail(true); setGeneratedEmail(null);
    try {
      const res = await fetch("/api/quotes/generate-followup-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user?.tenantId ?? '' },
        body: JSON.stringify({
          customerName: [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || email,
          followUpNotes: followupNotes,
          staffName: user?.name ?? null,
        }),
      });
      const json = await res.json();
      if (json.email) setGeneratedEmail(json.email);
    } catch { /* noop */ } finally { setGeneratingEmail(false); }
  }

  function openEdit() {
    setEditForm({
      first_name: customer?.first_name ?? "",
      last_name:  customer?.last_name  ?? "",
      email:      email,
      phone:      customer?.phone      ?? "",
      street:     customer?.street     ?? "",
      suburb:     customer?.suburb     ?? "",
      state:      customer?.state      ?? "",
      postcode:   customer?.postcode   ?? "",
    });
    setEditError(null);
    setEditOpen(true);
  }

  async function saveEdit() {
    if (editSaving) return;
    if (!hydrated || !user?.tenantId) return;
    setEditSaving(true);
    try {
      const payload = { ...editForm, customer_id: customer?.customer_id ?? null };
      const res = await fetch(`/api/customers/${encodeURIComponent(email)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user.tenantId },
        body: JSON.stringify(payload),
      });
      const json = await res.json() as { success: boolean; customer?: Partial<CustomerData>; error?: string };
      if (json.success && json.customer) {
        setCustomer(prev => prev ? { ...prev, ...json.customer } : prev);
        setEditOpen(false);
        const newEmail = (json.customer.email ?? "").toLowerCase();
        if (newEmail && newEmail !== email.toLowerCase()) {
          router.replace(`/customers/${encodeURIComponent(newEmail)}`);
        }
      } else {
        setEditError(json.error ?? "Failed to save changes. Please try again.");
      }
    } catch (err) {
      console.error("[saveEdit] fetch threw:", err);
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteCustomer() {
    if (deleting || !hydrated || !user?.tenantId) return;
    setDeleting(true);
    try {
      const deleteUrl = customer?.customer_id
        ? `/api/customers/${encodeURIComponent(email)}?customer_id=${encodeURIComponent(customer.customer_id)}`
        : `/api/customers/${encodeURIComponent(email)}`;
      const res = await fetch(deleteUrl, {
        method: "DELETE",
        headers: { 'x-tenant-id': user.tenantId },
      });
      const json = await res.json() as { success: boolean; error?: string };
      if (json.success) {
        router.replace("/customers");
      } else {
        console.error("[deleteCustomer] error:", json.error);
        setDeleting(false);
        setDeleteConfirm(false);
      }
    } catch (err) {
      console.error("[deleteCustomer] fetch threw:", err);
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  async function sendSms() {
    const trimmed = smsCompose.trim();
    if (!trimmed || !customer?.customer_id || !user?.tenantId || smsSending) return;
    setSmsSending(true);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", 'x-tenant-id': user.tenantId },
        body: JSON.stringify({ customer_id: customer.customer_id, body: trimmed }),
      });
      const json = await res.json() as { success: boolean; message_id?: string };
      if (json.success) {
        setSmsMessages(prev => [...prev, {
          id: json.message_id ?? String(Date.now()),
          direction: "out",
          body: trimmed,
          sent_at: new Date().toISOString(),
          staff_id: null,
          read_at: null,
        }]);
        setSmsCompose("");
      }
    } catch { /* noop */ } finally { setSmsSending(false); }
  }

  function handlePacketUpdate(updated: Packet) {
    setPackets(prev => prev.map(p => p.id === updated.id ? updated : p));
    setSelectedPacket(updated);
  }
  function handlePacketDelete(id: string) {
    setPackets(prev => prev.filter(p => p.id !== id));
    setSelectedPacket(null);
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function handleRetry(_id: string, _out: string) {}

  // ── Computed ──────────────────────────────────────────────────────────────
  const nonRepairPackets = packets.filter(p => p.packet_type !== "repair");
  const nonRepairSpend = nonRepairPackets.reduce((s, p) => s + (typeof p.total_charges === "number" ? p.total_charges : 0), 0);
  const timeline: TimelineEvent[] = [
    ...packets.map((p): TimelineEvent => ({
      date: p.created_at, type: "order", label: packetTypeLabel(p.packet_type),
      description: [p.articles, p.instructions].filter(Boolean).join(" — ") || "—",
      amount: typeof p.total_charges === "number" ? p.total_charges : null,
      ref: p.reference_number,
      status: p.collected_date ? "Collected" : (p.due_date && p.due_date < new Date().toISOString().split("T")[0] ? "Overdue" : "Active"),
    })),
    ...quotes.map((q): TimelineEvent => ({
      date: q.created_at, type: "quote", label: "Quote",
      description: q.notes || (q.line_items as { design?: string }[])?.[0]?.design || "—",
      amount: null, ref: q.reference_number, status: q.status,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const displayName = [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") || email;
  const address = [customer?.street, customer?.suburb, customer?.state, customer?.postcode].filter(Boolean).join(", ");

  // Shared styles
  const PANEL = { padding: '16px 20px' };
  const TEXTAREA: React.CSSProperties = { width: '100%', borderRadius: 8, border: '1px solid #E8E8F0', background: '#F9FAFB', padding: '12px 16px', fontSize: 14, color: '#1A1A2E', outline: 'none', resize: 'vertical' as const, fontFamily: 'inherit' };
  const INPUT: React.CSSProperties = { border: '1px solid #E8E8F0', borderRadius: 8, padding: '8px 12px', fontSize: 14, outline: 'none', background: '#fff', color: '#1A1A2E' };
  const BTN: React.CSSProperties = { background: '#635BFF', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' };
  const BTN_SM: React.CSSProperties = { background: 'transparent', color: '#9CA3AF', border: '1px solid #E8E8F0', borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer' };
  const SEC: React.CSSProperties = { fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 };

  // ── Guards ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4 animate-pulse">
        <div className="h-10 bg-gray-200 rounded-xl w-64" />
        <div className="h-32 bg-gray-200 rounded-2xl" />
        <div className="h-64 bg-gray-200 rounded-2xl" />
      </div>
    );
  }
  if (!customer && packets.length === 0 && quotes.length === 0) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-gray-400">No data found for <strong>{email}</strong></p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {editOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setEditOpen(false); }}
        >
          <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, padding: 24, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>Edit Customer</h2>
              <button onClick={() => setEditOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, color: '#9CA3AF', lineHeight: 1, padding: '0 2px' }}>×</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>First Name</label>
                  <input type="text" value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Last Name</label>
                  <input type="text" value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Email</label>
                <input type="text" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Phone</label>
                <input type="text" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Street Address</label>
                <input type="text" value={editForm.street} onChange={e => setEditForm(f => ({ ...f, street: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px', gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Suburb</label>
                  <input type="text" value={editForm.suburb} onChange={e => setEditForm(f => ({ ...f, suburb: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>State</label>
                  <input type="text" value={editForm.state} onChange={e => setEditForm(f => ({ ...f, state: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 500, color: '#6B7280', display: 'block', marginBottom: 4 }}>Postcode</label>
                  <input type="text" value={editForm.postcode} onChange={e => setEditForm(f => ({ ...f, postcode: e.target.value }))} style={{ ...INPUT, width: '100%' }} />
                </div>
              </div>
            </div>

            {user?.role === 'manager' && (
              <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #F3F4F6' }}>
                {!deleteConfirm ? (
                  <button
                    onClick={() => setDeleteConfirm(true)}
                    style={{ ...BTN_SM, color: '#DC2626', border: '1px solid #FECACA', background: '#FEF2F2', padding: '8px 16px', fontSize: 13, width: '100%' }}
                  >
                    Delete Customer
                  </button>
                ) : (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: 14 }}>
                    <p style={{ fontSize: 13, color: '#DC2626', fontWeight: 600, margin: '0 0 4px' }}>Are you sure?</p>
                    <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 12px' }}>This will permanently delete the customer record. This cannot be undone.</p>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => setDeleteConfirm(false)}
                        style={{ ...BTN_SM, flex: 1, color: '#374151', border: '1px solid #E8E8F0', padding: '7px 0', fontSize: 13 }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={deleteCustomer}
                        disabled={deleting}
                        style={{ ...BTN_SM, flex: 1, background: '#DC2626', color: '#fff', border: 'none', padding: '7px 0', fontSize: 13, opacity: deleting ? 0.7 : 1, cursor: deleting ? 'not-allowed' : 'pointer' }}
                      >
                        {deleting ? "Deleting…" : "Yes, Delete"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {editError && (
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px', marginTop: 12 }}>
                <p style={{ fontSize: 13, color: '#DC2626', margin: 0 }}>{editError}</p>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
              <button onClick={() => { setEditOpen(false); setDeleteConfirm(false); }} style={{ ...BTN_SM, color: '#374151', border: '1px solid #E8E8F0', padding: '8px 16px', fontSize: 13 }}>Cancel</button>
              <button onClick={saveEdit} disabled={editSaving || !hydrated || !user} style={{ ...BTN, opacity: (editSaving || !hydrated || !user) ? 0.7 : 1 }}>
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedPacket && (
        <PacketDetailDrawer
          packet={selectedPacket}
          onClose={() => setSelectedPacket(null)}
          onDelete={handlePacketDelete}
          onUpdate={handlePacketUpdate}
          onRetry={handleRetry}
        />
      )}

      {saveError && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 20px', zIndex: 100, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', display: 'flex', alignItems: 'center', gap: 12, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 13, color: '#DC2626', fontWeight: 500 }}>{saveError}</span>
          <button onClick={() => setSaveError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, padding: 24 }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#635BFF', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, fontWeight: 700, flexShrink: 0 }}>
                  {(customer?.first_name?.[0] ?? email[0] ?? "?").toUpperCase()}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>{displayName}</h1>
                    {vipTier && (
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 999, background: `${vipTier.colour}22`, color: vipTier.colour, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        {vipTier.tier_name}
                      </span>
                    )}
                    <button onClick={openEdit} style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 8, border: '1px solid #E8E8F0', background: '#F9FAFB', color: '#374151', cursor: 'pointer' }}>
                      Edit
                    </button>
                  </div>
                  <p style={{ fontSize: 14, color: '#6B7280', margin: '2px 0 0' }}>{email}</p>
                  {customer?.maiden_name && (
                    <p style={{ fontSize: 12, color: '#9CA3AF', margin: '2px 0 0' }}>née {customer.maiden_name}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-2">
                {customer?.phone && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.338c0-1.023.916-1.838 1.904-1.838h.394c.97 0 1.838.755 1.904 1.838l.263 3.507c.063.839-.486 1.602-1.321 1.77l-.522.104a.75.75 0 00-.563.73c0 2.117 1.73 4.388 4.055 5.51a.75.75 0 00.73-.077l.376-.3c.647-.516 1.567-.587 2.284-.11l2.905 1.937a1.905 1.905 0 01-.082 3.2l-.367.22A3.754 3.754 0 017.5 21.75C4.045 21.75 2.25 17.39 2.25 12c0-2.56.67-4.96 1.838-6.85z" /></svg>
                    {customer.phone}
                  </span>
                )}
                {address && (
                  <span className="flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                    {address}
                  </span>
                )}
              </div>

              {/* Maiden name input */}
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12, color: '#6B7280', whiteSpace: 'nowrap' }}>Maiden name:</label>
                <input
                  type="text"
                  value={maidenName}
                  onChange={e => setMaidenName(e.target.value)}
                  onBlur={saveMaidenName}
                  placeholder="née …"
                  style={{ ...INPUT, fontSize: 13, padding: '5px 10px', maxWidth: 180 }}
                />
                {maidenNameSaving && <span style={{ fontSize: 12, color: '#9CA3AF' }}>Saving…</span>}
              </div>
            </div>

            {/* Stats */}
            <div className="flex gap-2 flex-wrap">
              <StatPill label="Orders" value={customer?.total_orders ?? packets.length} accent />
              <StatPill label="Quotes" value={customer?.total_quotes ?? quotes.length} />
              <StatPill label="Spend" value={customer && customer.total_spend > 0 ? formatCurrency(customer.total_spend) : "—"} />
              <StatPill label="First visit" value={formatDateAU(customer?.first_seen?.split("T")[0]) || "—"} />
              <StatPill label="Last visit" value={formatDateAU(customer?.last_visit?.split("T")[0]) || "—"} />
            </div>
          </div>
        </div>

        {/* ── Tab panel ────────────────────────────────────────────────────── */}
        <div style={{ background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, overflow: 'hidden' }}>

          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E8E8F0', overflowX: 'auto' }}>
            <TabButton label="Orders"       active={activeTab === "orders"}       onClick={() => setActiveTab("orders")}       count={packets.length} />
            <TabButton label="Quotes"       active={activeTab === "quotes"}       onClick={() => setActiveTab("quotes")}       count={quotes.length} />
            <TabButton label="Timeline"     active={activeTab === "timeline"}     onClick={() => setActiveTab("timeline")}     count={timeline.length} />
            <TabButton label="Notes"        active={activeTab === "notes"}        onClick={() => setActiveTab("notes")} />
            <TabButton label="Partners"     active={activeTab === "partners"}     onClick={() => setActiveTab("partners")}     count={partners.length || undefined} />
            <TabButton label="Wishlist"     active={activeTab === "wishlist"}     onClick={() => setActiveTab("wishlist")} />
            <TabButton label="Appointments" active={activeTab === "appointments"} onClick={() => setActiveTab("appointments")} count={appointments.filter(a => a.status === "upcoming").length || undefined} />
            <TabButton label="Follow-up"    active={activeTab === "followup"}     onClick={() => setActiveTab("followup")} />
            <TabButton label="SMS"         active={activeTab === "sms"}         onClick={() => setActiveTab("sms")}         count={smsUnread || undefined} />
          </div>

          {/* ── Orders tab ─────────────────────────────────────────────────── */}
          {activeTab === "orders" && (
            <div className="overflow-x-auto">
              {packets.length === 0 ? (
                <p className="px-5 py-10 text-center text-gray-400 text-sm">No orders on file</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                      {['Reference','Type','Description','Due','Total','Status','Specs','Certificate'].map(h => (
                        <th key={h} style={{ padding: '12px 20px', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {packets.map(p => {
                      const overdue = p.due_date && p.due_date < new Date().toISOString().split("T")[0] && !p.collected_date;
                      const status = p.collected_date ? "Collected" : overdue ? "Overdue" : "Active";
                      return (
                        <tr key={p.id} onClick={() => setSelectedPacket(p)} style={{ borderBottom: '1px solid #E8E8F0', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                          <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{p.reference_number}</td>
                          <td style={{ padding: '12px 20px' }}><span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...(TYPE_BADGE[p.packet_type] ?? DEF_BADGE) }}>{packetTypeLabel(p.packet_type)}</span></td>
                          <td style={{ padding: '12px 20px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.articles || p.instructions || "—"}</td>
                          <td style={{ padding: '12px 20px', fontSize: 14, color: overdue ? '#EF4444' : '#6B7280', fontWeight: overdue ? 600 : 400 }}>{formatDateAU(p.due_date) || "—"}</td>
                          <td style={{ padding: '12px 20px', fontWeight: 600, color: '#1A1A2E' }}>{typeof p.total_charges === "number" ? formatCurrency(p.total_charges) : "—"}</td>
                          <td style={{ padding: '12px 20px' }}>
                            <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...(status === "Collected" ? { background: '#DCFCE7', color: '#166534' } : status === "Overdue" ? { background: '#FEE2E2', color: '#991B1B' } : { background: '#F3F4F6', color: '#374151' }) }}>
                              {status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            {p.item_specifications && Object.keys(p.item_specifications as Record<string, unknown>).length > 0 && (
                              <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: '#DBEAFE', color: '#1E40AF' }}>Specs</span>
                            )}
                          </td>
                          <td style={{ padding: '12px 20px' }}>
                            {p.valuation_status === "approved" && (
                              <button
                                onClick={e => { e.stopPropagation(); import("@/lib/valuationCertificateGenerator").then(({ generateValuationCertificate }) => generateValuationCertificate(p)); }}
                                style={{ display: 'inline-flex', padding: '4px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: '#DCFCE7', color: '#166534', border: 'none', cursor: 'pointer' }}
                              >View Certificate</button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Quotes tab ─────────────────────────────────────────────────── */}
          {activeTab === "quotes" && (
            <div className="overflow-x-auto">
              {quotes.length === 0 ? (
                <p className="px-5 py-10 text-center text-gray-400 text-sm">No quotes on file</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #E8E8F0', background: '#F9FAFB' }}>
                      {['Reference','Type','Notes','Stage','Assigned To','Created'].map(h => (
                        <th key={h} style={{ padding: '12px 20px', fontSize: 11, fontWeight: 500, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map(q => (
                      <tr key={q.id} style={{ borderBottom: '1px solid #E8E8F0' }} onMouseEnter={e => (e.currentTarget as HTMLTableRowElement).style.background = '#F9FAFB'} onMouseLeave={e => (e.currentTarget as HTMLTableRowElement).style.background = 'transparent'}>
                        <td style={{ padding: '12px 20px', fontFamily: 'monospace', fontSize: 11, color: '#6B7280' }}>{q.reference_number}</td>
                        <td style={{ padding: '12px 20px', color: '#374151' }}>{q.quote_type || "—"}</td>
                        <td style={{ padding: '12px 20px', color: '#6B7280', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.notes || "—"}</td>
                        <td style={{ padding: '12px 20px' }}><span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...(STAGE_BADGE[q.status] ?? DEF_BADGE) }}>{(q.status ?? "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span></td>
                        <td style={{ padding: '12px 20px', color: '#6B7280' }}>{q.assigned_to || q.staff_member || "—"}</td>
                        <td style={{ padding: '12px 20px', color: '#9CA3AF', fontSize: 12 }}>{formatDateAU(q.created_at?.split("T")[0])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ── Timeline tab ───────────────────────────────────────────────── */}
          {activeTab === "timeline" && (
            <div style={PANEL}>
              {timeline.length === 0 ? (
                <p style={{ padding: '40px 0', textAlign: 'center', color: '#9CA3AF', fontSize: 14 }}>No history</p>
              ) : (
                <div style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: 20, top: 0, bottom: 0, width: 1, background: '#E8E8F0' }} />
                  <div style={{ paddingLeft: 56, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {timeline.map((ev, i) => (
                      <div key={i} style={{ position: 'relative' }}>
                        <div style={{ position: 'absolute', left: -36, top: 4, width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, background: ev.type === "order" ? '#635BFF' : '#EEF2FF', color: ev.type === "order" ? '#fff' : '#635BFF' }}>
                          {ev.type === "order" ? "📦" : "💬"}
                        </div>
                        <div style={{ background: '#fff', border: '1px solid #E8E8F0', borderRadius: 12, padding: 12 }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 14, fontWeight: 600, color: '#1A1A2E' }}>{ev.label}</span>
                                <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, ...(ev.type === "order" ? (ev.status === "Collected" ? { background: '#DCFCE7', color: '#166534' } : ev.status === "Overdue" ? { background: '#FEE2E2', color: '#991B1B' } : { background: '#F3F4F6', color: '#374151' }) : (STAGE_BADGE[ev.status] ?? DEF_BADGE)) }}>
                                  {ev.status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                </span>
                                <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#D1D5DB' }}>{ev.ref}</span>
                              </div>
                              <p style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{ev.description}</p>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                              {ev.amount != null && <p style={{ fontSize: 14, fontWeight: 700, color: '#1A1A2E', margin: 0 }}>{formatCurrency(ev.amount)}</p>}
                              <p style={{ fontSize: 12, color: '#9CA3AF' }}>{formatDateAU(ev.date.split("T")[0])}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Notes tab ──────────────────────────────────────────────────── */}
          {activeTab === "notes" && (
            <div style={PANEL}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={SEC}>Staff Notes</label>
                {notesSaving && <span style={{ fontSize: 12, color: '#9CA3AF' }} className="animate-pulse">Saving…</span>}
              </div>
              <textarea rows={8} value={notes} onChange={e => { setNotes(e.target.value); saveNotes(e.target.value); }} placeholder="Add notes about this customer — preferences, history, anything relevant for future visits…" style={TEXTAREA} />
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Notes save automatically. Visible to all staff.</p>
            </div>
          )}

          {/* ── Partners tab ───────────────────────────────────────────────── */}
          {activeTab === "partners" && (
            <div style={PANEL}>
              {partners.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={SEC}>Linked Partners</div>
                  {partners.map(p => (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #E8E8F0', borderRadius: 10, marginBottom: 8, background: '#F9FAFB' }}>
                      <div>
                        <Link href={`/customers/${encodeURIComponent(p.partner_email)}`} style={{ fontSize: 14, fontWeight: 600, color: '#635BFF', textDecoration: 'none' }}>
                          {p.partner_name || p.partner_email}
                        </Link>
                        <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 1 }}>{p.partner_email}</div>
                      </div>
                      <button onClick={() => unlinkPartner(p.partner_email)} style={BTN_SM}>Unlink</button>
                    </div>
                  ))}
                </div>
              )}
              <div style={SEC}>Link a Partner</div>
              <input type="text" value={partnerQuery} onChange={e => setPartnerQuery(e.target.value)} placeholder="Search by name or email…" style={{ ...INPUT, width: '100%', marginBottom: 8 }} />
              {partnerSearching && <div style={{ fontSize: 13, color: '#9CA3AF', padding: '6px 0' }}>Searching…</div>}
              {partnerResults.map(r => {
                const pName = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;
                return (
                  <div key={r.email} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, border: '1px solid #E8E8F0', marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#1A1A2E' }}>{pName}</div>
                      <div style={{ fontSize: 12, color: '#9CA3AF' }}>{r.email}</div>
                    </div>
                    <button onClick={() => linkPartner(r.email)} disabled={linkingPartner === r.email} style={{ ...BTN, padding: '6px 14px', fontSize: 12, opacity: linkingPartner === r.email ? 0.6 : 1 }}>
                      {linkingPartner === r.email ? "Linking…" : "Link"}
                    </button>
                  </div>
                );
              })}
              {partners.length === 0 && !partnerQuery && !partnerSearching && (
                <p style={{ fontSize: 13, color: '#9CA3AF', marginTop: 4 }}>Search for a customer above to link them as a partner.</p>
              )}
            </div>
          )}

          {/* ── Wishlist tab ───────────────────────────────────────────────── */}
          {activeTab === "wishlist" && (
            <div style={PANEL}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={SEC}>Wishlist & Interests</label>
                {wishlistSaving && <span style={{ fontSize: 12, color: '#9CA3AF' }} className="animate-pulse">Saving…</span>}
              </div>
              <textarea rows={8} value={wishlistNotes} onChange={e => { setWishlistNotes(e.target.value); saveWishlist(e.target.value); }} placeholder="Items they've looked at, styles they love, price ranges discussed, dream pieces…" style={TEXTAREA} />
              <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>Saves automatically.</p>
            </div>
          )}

          {/* ── Appointments tab ───────────────────────────────────────────── */}
          {activeTab === "appointments" && (
            <div style={PANEL}>
              {/* Add form */}
              <div style={{ marginBottom: 20 }}>
                <div style={SEC}>New Appointment</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                  <input type="date" value={newApptDate} onChange={e => setNewApptDate(e.target.value)} style={{ ...INPUT, flex: 1, minWidth: 140 }} />
                  <input type="time" value={newApptTime} onChange={e => setNewApptTime(e.target.value)} style={{ ...INPUT, width: 130 }} />
                </div>
                <input type="text" value={newApptNotes} onChange={e => setNewApptNotes(e.target.value)} placeholder="Notes (optional)" style={{ ...INPUT, width: '100%', marginBottom: 10 }} />
                <button onClick={addAppointment} disabled={!newApptDate || addingAppt} style={{ ...BTN, opacity: (!newApptDate || addingAppt) ? 0.5 : 1 }}>
                  {addingAppt ? "Saving…" : "Add Appointment"}
                </button>
              </div>

              {(() => {
                const upcoming = appointments.filter(a => a.status === "upcoming");
                const done = appointments.filter(a => a.status !== "upcoming");
                if (appointments.length === 0) return <p style={{ fontSize: 13, color: '#9CA3AF' }}>No appointments logged yet.</p>;
                return (
                  <>
                    {upcoming.length > 0 && (
                      <>
                        <div style={SEC}>Upcoming</div>
                        {upcoming.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', border: '1px solid #E8E8F0', borderRadius: 10, padding: '12px 14px', marginBottom: 8, background: '#F9FAFB' }}>
                            <div>
                              <div style={{ fontWeight: 600, color: '#1A1A2E', fontSize: 14 }}>
                                {formatDateAU(a.appointment_date)}{a.appointment_time ? ` at ${String(a.appointment_time).slice(0,5)}` : ''}
                              </div>
                              {a.notes && <p style={{ fontSize: 13, color: '#6B7280', margin: '3px 0 0' }}>{a.notes}</p>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button onClick={() => toggleApptStatus(a)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 8, border: '1px solid #10B981', background: '#F0FDF4', color: '#10B981', cursor: 'pointer', fontWeight: 500 }}>Complete</button>
                              <button onClick={() => deleteAppt(a.id)} style={BTN_SM}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                    {done.length > 0 && (
                      <>
                        <div style={{ ...SEC, color: '#9CA3AF', marginTop: upcoming.length ? 16 : 0 }}>Completed</div>
                        {done.map(a => (
                          <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', border: '1px solid #E8E8F0', borderRadius: 10, padding: '12px 14px', marginBottom: 8, opacity: 0.6 }}>
                            <div>
                              <div style={{ fontWeight: 500, color: '#6B7280', fontSize: 14, textDecoration: 'line-through' }}>
                                {formatDateAU(a.appointment_date)}{a.appointment_time ? ` at ${String(a.appointment_time).slice(0,5)}` : ''}
                              </div>
                              {a.notes && <p style={{ fontSize: 13, color: '#9CA3AF', margin: '3px 0 0' }}>{a.notes}</p>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                              <button onClick={() => toggleApptStatus(a)} style={{ ...BTN_SM, color: '#6B7280' }}>Reopen</button>
                              <button onClick={() => deleteAppt(a.id)} style={BTN_SM}>Delete</button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── Follow-up tab ──────────────────────────────────────────────── */}
          {activeTab === "followup" && (
            <div style={PANEL}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <label style={SEC}>Follow-up Notes</label>
                {followupSaving && <span style={{ fontSize: 12, color: '#9CA3AF' }} className="animate-pulse">Saving…</span>}
              </div>
              <textarea
                rows={5}
                value={followupNotes}
                onChange={e => setFollowupNotes(e.target.value)}
                onBlur={saveFollowup}
                placeholder="What do they want, what was discussed, anything to reference in a follow-up email…"
                style={{ ...TEXTAREA, marginBottom: 12 }}
              />
              <button onClick={generateEmail} disabled={generatingEmail} style={{ ...BTN, opacity: generatingEmail ? 0.75 : 1 }}>
                {generatingEmail ? "Generating…" : "Generate Follow-up Email"}
              </button>
              {generatedEmail && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 500 }}>Generated Email</span>
                    <button onClick={() => { navigator.clipboard.writeText(generatedEmail); setEmailCopied(true); setTimeout(() => setEmailCopied(false), 2000); }} style={{ fontSize: 12, color: '#635BFF', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}>
                      {emailCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#374151', background: '#F9FAFB', border: '1px solid #E8E8F0', borderRadius: 8, padding: '12px 14px', lineHeight: 1.7, margin: 0, fontFamily: 'inherit' }}>
                    {generatedEmail}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* ── SMS tab ──────────────────────────────────────────────────── */}
          {activeTab === "sms" && (
            <div style={{ display: 'flex', flexDirection: 'column', height: 500 }}>
              {/* Message thread */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {!smsLoaded && <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, paddingTop: 40 }}>Loading…</p>}
                {smsLoaded && smsMessages.length === 0 && (
                  <p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: 13, paddingTop: 40 }}>No messages yet. Send one below.</p>
                )}
                {smsMessages.map(msg => (
                  <div key={msg.id} style={{ display: 'flex', justifyContent: msg.direction === 'out' ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '70%',
                      padding: '10px 14px',
                      borderRadius: msg.direction === 'out' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                      background: msg.direction === 'out' ? '#635BFF' : '#F3F4F6',
                      color: msg.direction === 'out' ? '#fff' : '#1A1A2E',
                      fontSize: 14,
                    }}>
                      <p style={{ margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{msg.body}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 11, opacity: 0.65, textAlign: 'right' }}>
                        {new Date(msg.sent_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={smsEndRef} />
              </div>

              {/* Template pills */}
              <div style={{ padding: '10px 20px 6px', borderTop: '1px solid #E8E8F0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {["Your item is ready for pickup", "Following up on your recent quote", "Your appointment is confirmed"].map(t => (
                  <button key={t} onClick={() => setSmsCompose(t)} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 999, border: '1px solid #E8E8F0', background: '#F9FAFB', color: '#635BFF', cursor: 'pointer', fontWeight: 500 }}>
                    {t}
                  </button>
                ))}
              </div>

              {/* Compose */}
              <div style={{ padding: '8px 16px 16px', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                {!customer?.phone ? (
                  <p style={{ fontSize: 13, color: '#EF4444', margin: 0 }}>No phone number on file for this customer.</p>
                ) : (
                  <>
                    <textarea
                      rows={2}
                      value={smsCompose}
                      onChange={e => setSmsCompose(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendSms(); } }}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      style={{ ...TEXTAREA, flex: 1, resize: 'none', padding: '10px 12px', fontSize: 13 }}
                    />
                    <button
                      onClick={() => void sendSms()}
                      disabled={!smsCompose.trim() || smsSending}
                      style={{ ...BTN, flexShrink: 0, opacity: (!smsCompose.trim() || smsSending) ? 0.5 : 1, padding: '10px 18px' }}
                    >
                      {smsSending ? "Sending…" : "Send"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
