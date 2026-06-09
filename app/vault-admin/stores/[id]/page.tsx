"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Store {
  id: string; tenant_id: string; plan: string; billing_status: string;
  monthly_fee_aud: number; billing_start_date: string | null; next_billing_date: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null;
  store_city: string | null; store_state: string | null; website_url: string | null;
  notes: string | null;
  onboarding_dns_connected: boolean; onboarding_staff_loaded: boolean;
  onboarding_first_order: boolean; onboarding_training_done: boolean;
  onboarding_billing_active: boolean;
  tenant: { id: string; name: string; slug: string; subscription_status: string } | null;
}

interface ActivityEntry { id: string; store_id: string; type: string; content: string; created_at: string; }

const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  active:    { bg: "#10B981", color: "#fff" },
  trial:     { bg: "#635BFF", color: "#fff" },
  overdue:   { bg: "#F59E0B", color: "#fff" },
  suspended: { bg: "#EF4444", color: "#fff" },
  cancelled: { bg: "#9ca3af", color: "#fff" },
};

const ACTIVITY_TYPE_COLOUR: Record<string, string> = {
  note:           "#6b7280",
  call:           "#10B981",
  email:          "#635BFF",
  billing_event:  "#F59E0B",
  status_change:  "#EF4444",
};

// ── Inline editable field ─────────────────────────────────────────────────────

function InlineField({ label, value, onSave, type = "text" }: {
  label: string; value: string | null; onSave: (v: string) => void; type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const handleBlur = () => {
    setEditing(false);
    if (draft !== (value ?? "")) onSave(draft);
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</label>
      {editing ? (
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => { if (e.key === "Enter") handleBlur(); if (e.key === "Escape") { setDraft(value ?? ""); setEditing(false); } }}
          style={{ width: "100%", border: "1px solid #635BFF", borderRadius: 7, padding: "7px 10px", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "Inter, sans-serif" }}
        />
      ) : (
        <div
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          style={{ fontSize: 14, color: value ? "#111827" : "#d1d5db", cursor: "pointer", padding: "7px 10px", borderRadius: 7, border: "1px solid transparent", minHeight: 36, display: "flex", alignItems: "center" }}
          title="Click to edit"
        >
          {value || <span style={{ fontStyle: "italic", color: "#d1d5db" }}>—</span>}
          <span style={{ marginLeft: "auto", color: "#d1d5db", fontSize: 12 }}>✏</span>
        </div>
      )}
    </div>
  );
}

// ── Inline select field ───────────────────────────────────────────────────────

function SelectField({ label, value, options, onSave }: {
  label: string; value: string; options: string[]; onSave: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onSave(e.target.value)}
        style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 7, padding: "7px 10px", fontSize: 14, background: "#fff", fontFamily: "Inter, sans-serif", textTransform: "capitalize" }}
      >
        {options.map((o) => <option key={o} value={o} style={{ textTransform: "capitalize" }}>{o}</option>)}
      </select>
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E8E8F0", padding: "20px 22px" }}>
      <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1A1760", margin: "0 0 16px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{title}</h3>
      {children}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function StoreDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [newActivityType, setNewActivityType] = useState("note");
  const [newActivityContent, setNewActivityContent] = useState("");
  const [addingActivity, setAddingActivity] = useState(false);

  const fetchStore = useCallback(async () => {
    const res = await fetch(`/api/vault-admin/stores/${id}`);
    const json = await res.json();
    setStore(json.store ?? null);
    setLoading(false);
  }, [id]);

  const fetchActivity = useCallback(async () => {
    const res = await fetch(`/api/vault-admin/activity?store_id=${id}`);
    const json = await res.json();
    setActivity(json.activity ?? []);
  }, [id]);

  useEffect(() => { fetchStore(); fetchActivity(); }, [fetchStore, fetchActivity]);

  const patch = async (fields: Record<string, unknown>) => {
    const res = await fetch(`/api/vault-admin/stores/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    const json = await res.json();
    if (json.store) setStore(json.store);
  };

  const addActivity = async () => {
    if (!newActivityContent.trim()) return;
    setAddingActivity(true);
    try {
      await fetch("/api/vault-admin/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ store_id: id, type: newActivityType, content: newActivityContent }),
      });
      setNewActivityContent("");
      await fetchActivity();
    } finally {
      setAddingActivity(false);
    }
  };

  if (loading) return <div style={{ padding: 40, color: "#9ca3af", fontFamily: "Inter, sans-serif" }}>Loading…</div>;
  if (!store) return <div style={{ padding: 40, color: "#ef4444", fontFamily: "Inter, sans-serif" }}>Store not found.</div>;

  const statusStyle = STATUS_STYLE[store.billing_status] ?? STATUS_STYLE.cancelled;
  const onboarding = [
    { key: "onboarding_dns_connected",  label: "DNS Connected" },
    { key: "onboarding_staff_loaded",   label: "Staff Loaded" },
    { key: "onboarding_first_order",    label: "First Order Created" },
    { key: "onboarding_training_done",  label: "Training Complete" },
    { key: "onboarding_billing_active", label: "Billing Active" },
  ] as const;

  return (
    <div style={{ padding: "32px 36px", maxWidth: 1200, fontFamily: "Inter, sans-serif" }}>
      {/* Top bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28 }}>
        <button onClick={() => router.push("/vault-admin")} style={{ background: "transparent", border: "none", color: "#635BFF", fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "Inter, sans-serif" }}>
          ← Dashboard
        </button>
        <span style={{ color: "#d1d5db" }}>|</span>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", margin: 0 }}>{store.tenant?.name ?? "Store"}</h1>
        {store.tenant?.slug && (
          <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: "monospace", background: "#f3f4f6", padding: "3px 8px", borderRadius: 5 }}>
            {store.tenant.slug}
          </span>
        )}
        <span style={{ display: "inline-block", padding: "3px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: "capitalize", background: statusStyle.bg, color: statusStyle.color }}>
          {store.billing_status}
        </span>
      </div>

      {/* Three-column grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20, marginBottom: 24 }}>

        {/* Left — Store Info */}
        <Card title="Store Info">
          <InlineField label="Contact Name"  value={store.contact_name}  onSave={(v) => patch({ contact_name: v || null })} />
          <InlineField label="Contact Email" value={store.contact_email} onSave={(v) => patch({ contact_email: v || null })} type="email" />
          <InlineField label="Contact Phone" value={store.contact_phone} onSave={(v) => patch({ contact_phone: v || null })} />
          <InlineField label="City"          value={store.store_city}    onSave={(v) => patch({ store_city: v || null })} />
          <InlineField label="State"         value={store.store_state}   onSave={(v) => patch({ store_state: v || null })} />
          <InlineField label="Website"       value={store.website_url}   onSave={(v) => patch({ website_url: v || null })} />
        </Card>

        {/* Middle — Billing */}
        <Card title="Billing">
          <SelectField
            label="Plan"
            value={store.plan}
            options={["trial","starter","pro","enterprise"]}
            onSave={(v) => patch({ plan: v })}
          />
          <SelectField
            label="Billing Status"
            value={store.billing_status}
            options={["trial","active","overdue","suspended","cancelled"]}
            onSave={(v) => patch({ billing_status: v })}
          />
          <InlineField
            label="Monthly Fee (AUD)"
            value={store.monthly_fee_aud != null ? String(store.monthly_fee_aud) : ""}
            onSave={(v) => patch({ monthly_fee_aud: parseFloat(v) || 0 })}
            type="number"
          />
          <InlineField
            label="Billing Start Date"
            value={store.billing_start_date ?? ""}
            onSave={(v) => patch({ billing_start_date: v || null })}
            type="date"
          />
          <InlineField
            label="Next Billing Date"
            value={store.next_billing_date ?? ""}
            onSave={(v) => patch({ next_billing_date: v || null })}
            type="date"
          />
        </Card>

        {/* Right — Onboarding */}
        <Card title="Onboarding Checklist">
          {onboarding.map(({ key, label }) => (
            <label key={key} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={!!store[key]}
                onChange={(e) => patch({ [key]: e.target.checked })}
                style={{ width: 16, height: 16, accentColor: "#635BFF" }}
              />
              <span style={{ fontSize: 14, color: store[key] ? "#111827" : "#6b7280" }}>{label}</span>
            </label>
          ))}
          <div style={{ marginTop: 8, height: 6, background: "#f3f4f6", borderRadius: 3 }}>
            <div style={{
              height: 6, borderRadius: 3, background: "#10B981",
              width: `${(onboarding.filter(({ key }) => store[key]).length / 5) * 100}%`,
              transition: "width 0.3s",
            }} />
          </div>
          <p style={{ fontSize: 12, color: "#9ca3af", marginTop: 6 }}>
            {onboarding.filter(({ key }) => store[key]).length} / 5 complete
          </p>
        </Card>
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 24 }}>
        <Card title="Notes">
          <textarea
            defaultValue={store.notes ?? ""}
            onBlur={(e) => { if (e.target.value !== (store.notes ?? "")) patch({ notes: e.target.value || null }); }}
            placeholder="Internal notes about this store…"
            rows={4}
            style={{ width: "100%", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", fontSize: 14, resize: "vertical", outline: "none", boxSizing: "border-box", fontFamily: "Inter, sans-serif", color: "#374151" }}
          />
        </Card>
      </div>

      {/* Activity log */}
      <Card title="Activity Log">
        {/* Add entry */}
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          <select
            value={newActivityType}
            onChange={(e) => setNewActivityType(e.target.value)}
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#fff", fontFamily: "Inter, sans-serif" }}
          >
            {["note","call","email","billing_event","status_change"].map((t) => (
              <option key={t} value={t}>{t.replace("_", " ")}</option>
            ))}
          </select>
          <input
            value={newActivityContent}
            onChange={(e) => setNewActivityContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addActivity(); }}
            placeholder="Add a note, log a call…"
            style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", fontFamily: "Inter, sans-serif" }}
          />
          <button
            onClick={addActivity}
            disabled={addingActivity || !newActivityContent.trim()}
            style={{ background: "#635BFF", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Add
          </button>
        </div>

        {/* Entries */}
        {activity.length === 0 ? (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>No activity yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activity.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "10px 14px", background: "#f9fafb", borderRadius: 8, borderLeft: `3px solid ${ACTIVITY_TYPE_COLOUR[a.type] ?? "#9ca3af"}` }}>
                <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: ACTIVITY_TYPE_COLOUR[a.type] ?? "#9ca3af", whiteSpace: "nowrap", marginTop: 2 }}>
                  {a.type.replace("_", " ")}
                </span>
                <span style={{ fontSize: 13, color: "#374151", flex: 1 }}>{a.content}</span>
                <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                  {new Date(a.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
