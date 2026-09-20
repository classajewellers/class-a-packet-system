"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { PinSessionProvider, usePinSession } from "@/context/PinSessionContext";
import {
  Lead,
  LEAD_SOURCES,
  LEAD_STATUSES,
  LEAD_STATUS_CONFIG,
  LeadStatus,
  leadSourceLabel,
  isLeadOverdue,
  defaultNextActionDate,
} from "@/lib/leads";

interface CustomerMatch {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  Page shell — provides the PIN session, then the tabbed UI.
// ═══════════════════════════════════════════════════════════════════════════
export default function LeadsPage() {
  return (
    <PinSessionProvider>
      <LeadsInner />
    </PinSessionProvider>
  );
}

function LeadsInner() {
  const [view, setView] = useState<"capture" | "board">("capture");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div style={{ padding: "24px 20px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: "var(--vault-text-page-title)", fontWeight: 600, color: "var(--vault-text)" }}>Leads</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--vault-text-secondary)" }}>
            Capture every enquiry with a next action so nothing falls behind.
          </p>
        </div>
        <div style={{ display: "flex", gap: 2, background: "var(--vault-surface)", border: "1px solid var(--vault-border)", borderRadius: "var(--vault-radius-sm)", padding: 3 }}>
          {(["capture", "board"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "7px 16px", borderRadius: 6, border: "none", cursor: "pointer",
                fontSize: 13, fontWeight: 600,
                background: view === v ? "var(--vault-canvas)" : "transparent",
                color: view === v ? "var(--vault-text)" : "var(--vault-text-secondary)",
                boxShadow: view === v ? "var(--vault-shadow-elevated)" : "none",
              }}
            >
              {v === "capture" ? "Capture" : "Board"}
            </button>
          ))}
        </div>
      </div>

      {view === "capture" ? (
        <CaptureForm onCreated={() => setRefreshKey((k) => k + 1)} />
      ) : (
        <LeadBoard refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Capture form — fast, counter/tablet friendly.
// ═══════════════════════════════════════════════════════════════════════════
function CaptureForm({ onCreated }: { onCreated: () => void }) {
  const { user } = useUser();
  const { ensurePin } = usePinSession();

  const blank = {
    name: "",
    phone: "",
    email: "",
    interested_in: "",
    source: "walk_in",
    next_action_date: defaultNextActionDate(),
  };
  const [form, setForm] = useState(blank);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [matches, setMatches] = useState<CustomerMatch[]>([]);
  const [matchLeadId, setMatchLeadId] = useState<string | null>(null);

  const set = (k: keyof typeof blank, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const tenantHeader = { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" };

  async function submit() {
    setError(null);
    setSuccess(null);
    setMatches([]);
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.phone.trim() && !form.email.trim()) { setError("Enter a phone or email — at least one is required"); return; }
    if (!form.interested_in.trim()) { setError("What are they interested in?"); return; }
    if (!form.next_action_date) { setError("A next action date is required"); return; }

    const creds = await ensurePin();
    if (!creds) return; // cancelled

    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: tenantHeader,
        body: JSON.stringify({ ...form, pinName: creds.name, pin: creds.pin }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Failed to save lead"); return; }

      onCreated();
      const lead = json.lead as Lead;
      if (Array.isArray(json.possible_matches) && json.possible_matches.length > 0) {
        setMatches(json.possible_matches as CustomerMatch[]);
        setMatchLeadId(lead.id);
        setSuccess(`Saved ${lead.name}. This enquiry may match an existing customer — link one below, or skip.`);
      } else {
        setSuccess(`Saved ${lead.name}. Next action: ${lead.next_action_date}.`);
      }
      setForm({ ...blank, next_action_date: defaultNextActionDate() });
    } catch {
      setError("Network error — the lead was not saved. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function linkCustomer(customerId: string | null) {
    if (!matchLeadId) return;
    if (customerId) {
      await fetch(`/api/leads/${matchLeadId}`, {
        method: "PATCH",
        headers: tenantHeader,
        body: JSON.stringify({ linked_customer_id: customerId }),
      });
      onCreated();
    }
    setMatches([]);
    setMatchLeadId(null);
    setSuccess(customerId ? "Linked to existing customer." : null);
  }

  const label: React.CSSProperties = { display: "block", fontSize: 12, fontWeight: 600, color: "var(--vault-text-secondary)", marginBottom: 5 };
  const input: React.CSSProperties = { width: "100%", padding: "11px 12px", borderRadius: "var(--vault-radius-sm)", border: "1px solid var(--vault-border)", fontSize: 15, background: "var(--vault-canvas)" };

  return (
    <div style={{ maxWidth: 560 }}>
      <div style={{ background: "var(--vault-canvas)", border: "1px solid var(--vault-border)", borderRadius: "var(--vault-radius-md)", padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={label}>Name *</label>
          <input style={input} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Customer name" />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={label}>Phone</label>
            <input style={input} inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="04…" />
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={label}>Email</label>
            <input style={input} inputMode="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" />
          </div>
        </div>
        <p style={{ margin: "-6px 0 0", fontSize: 12, color: "var(--vault-text-muted)" }}>At least one of phone or email is required.</p>

        <div>
          <label style={label}>Interested in *</label>
          <input style={input} value={form.interested_in} onChange={(e) => set("interested_in", e.target.value)} placeholder="e.g. engagement ring remodel, pearl restring" />
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 200px" }}>
            <label style={label}>Source *</label>
            <select style={input} value={form.source} onChange={(e) => set("source", e.target.value)}>
              {LEAD_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: "1 1 200px" }}>
            <label style={label}>Next action date *</label>
            <input style={input} type="date" value={form.next_action_date} onChange={(e) => set("next_action_date", e.target.value)} />
          </div>
        </div>

        {error && <p style={{ margin: 0, fontSize: 13, color: "var(--vault-status-error)", fontWeight: 500 }}>{error}</p>}
        {success && <p style={{ margin: 0, fontSize: 13, color: "var(--vault-status-success)", fontWeight: 500 }}>{success}</p>}

        {matches.length > 0 && (
          <div style={{ border: "1px solid #FCD34D", background: "#FFFBEB", borderRadius: "var(--vault-radius-sm)", padding: 12 }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 600, color: "var(--vault-status-warning)" }}>Possible existing customers</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {matches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => linkCustomer(m.id)}
                  style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px solid #FCD34D", background: "var(--vault-canvas)", cursor: "pointer", fontSize: 13 }}
                >
                  Link to <strong>{[m.first_name, m.last_name].filter(Boolean).join(" ") || "customer"}</strong>
                  {m.email ? ` · ${m.email}` : ""}{m.phone ? ` · ${m.phone}` : ""}
                </button>
              ))}
              <button onClick={() => linkCustomer(null)} style={{ textAlign: "left", padding: "8px 10px", borderRadius: 8, border: "1px dashed var(--vault-border-strong)", background: "transparent", cursor: "pointer", fontSize: 13, color: "var(--vault-text-secondary)" }}>
                Skip — don&apos;t link
              </button>
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="vault-btn vault-btn-primary"
          style={{
            marginTop: 4, height: 44, fontSize: 15,
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? "Saving…" : "Save enquiry"}
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//  Board — grouped by status, overdue rows in red.
// ═══════════════════════════════════════════════════════════════════════════
function LeadBoard({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const { user } = useUser();
  const { ensurePin } = usePinSession();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tenantHeader = { "Content-Type": "application/json", "x-tenant-id": user?.tenantId ?? "" };

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/leads", { headers: { "x-tenant-id": user?.tenantId ?? "" } });
      const json = await res.json();
      setLeads((json.leads ?? []) as Lead[]);
    } catch {
      setLeads([]);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId]);

  useEffect(() => { fetchLeads(); }, [fetchLeads, refreshKey]);

  async function changeStatus(lead: Lead, status: LeadStatus) {
    setError(null);
    const creds = await ensurePin();
    if (!creds) return;
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: tenantHeader,
        body: JSON.stringify({ status, pinName: creds.name, pin: creds.pin }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Update failed"); return; }
      await fetchLeads();
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  async function convert(lead: Lead) {
    setError(null);
    const creds = await ensurePin();
    if (!creds) return;
    setBusyId(lead.id);
    try {
      const res = await fetch(`/api/leads/${lead.id}/convert`, {
        method: "POST",
        headers: tenantHeader,
        body: JSON.stringify({ pinName: creds.name, pin: creds.pin }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Convert failed"); return; }
      await fetchLeads();
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p style={{ color: "var(--vault-text-secondary)", fontSize: 14 }}>Loading leads…</p>;

  return (
    <div>
      {error && <p style={{ fontSize: 13, color: "var(--vault-status-error)", fontWeight: 500, marginTop: 0 }}>{error}</p>}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 12, alignItems: "flex-start" }}>
        {LEAD_STATUSES.map((status) => {
          const config = LEAD_STATUS_CONFIG[status];
          const cards = leads
            .filter((l) => l.status === status)
            .sort((a, b) => a.next_action_date.localeCompare(b.next_action_date));
          return (
            <div key={status} style={{ flexShrink: 0, width: 270, display: "flex", flexDirection: "column", borderRadius: "var(--vault-radius-md)", overflow: "hidden", border: "1px solid var(--vault-border)", borderTop: `3px solid ${config.color}` }}>
              <div style={{ padding: "10px 12px", background: "var(--vault-surface)", borderBottom: "1px solid var(--vault-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ color: "var(--vault-text)", fontWeight: 600, fontSize: 13 }}>{config.label}</span>
                <span style={{ background: "var(--vault-surface-selected)", color: "var(--vault-text-secondary)", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "1px 8px" }}>{cards.length}</span>
              </div>
              <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 8, minHeight: 120, background: "var(--vault-surface)" }}>
                {cards.length === 0 && <p style={{ fontSize: 12, color: "var(--vault-text-muted)", textAlign: "center", paddingTop: 16, fontStyle: "italic" }}>None</p>}
                {cards.map((lead) => {
                  const overdue = isLeadOverdue(lead);
                  return (
                    <div
                      key={lead.id}
                      style={{
                        background: "var(--vault-canvas)", borderRadius: "var(--vault-radius-sm)", padding: 10,
                        border: overdue ? "1px solid #FCA5A5" : "1px solid var(--vault-border)",
                        borderLeft: overdue ? "3px solid var(--vault-status-error)" : "1px solid var(--vault-border)",
                        opacity: busyId === lead.id ? 0.6 : 1,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 6 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--vault-text)" }}>{lead.name}</span>
                        {lead.linked_customer_id && <span title="Linked to a customer" style={{ fontSize: 11, color: "var(--vault-status-success)", fontWeight: 600 }}>Linked</span>}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--vault-text-secondary)", marginTop: 2 }}>
                        {lead.phone || lead.email || "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--vault-text)", marginTop: 4 }}>{lead.interested_in}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                        <span style={{ fontSize: 11, color: "var(--vault-text-muted)" }}>{leadSourceLabel(lead.source)}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: overdue ? "var(--vault-status-error)" : "var(--vault-text-secondary)" }}>
                          {overdue ? "Overdue " : "Next "}{lead.next_action_date}
                        </span>
                      </div>

                      {(status === "new" || status === "contacted") && (
                        <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                          {status === "new" && (
                            <button onClick={() => changeStatus(lead, "contacted")} disabled={busyId === lead.id} style={miniBtn("secondary")}>Mark contacted</button>
                          )}
                          <button onClick={() => convert(lead)} disabled={busyId === lead.id} style={miniBtn("primary")}>Convert to Quote</button>
                          <button onClick={() => changeStatus(lead, "dead")} disabled={busyId === lead.id} style={miniBtn("secondary")}>Dead</button>
                        </div>
                      )}
                      {status === "quoted" && lead.converted_quote_id && (
                        <div style={{ marginTop: 8, fontSize: 11, color: "var(--vault-status-success)", fontWeight: 600 }}>Converted to quote ✓</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function miniBtn(variant: "primary" | "secondary"): React.CSSProperties {
  return variant === "primary"
    ? { padding: "6px 10px", borderRadius: 7, border: "none", background: "var(--vault-text)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }
    : { padding: "6px 10px", borderRadius: 7, border: "1px solid var(--vault-border)", background: "var(--vault-canvas)", color: "var(--vault-text-secondary)", fontSize: 12, fontWeight: 600, cursor: "pointer" };
}
