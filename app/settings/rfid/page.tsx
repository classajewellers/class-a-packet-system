"use client";

import { useState, useEffect, useCallback } from "react";
import { useUser } from "@/context/UserContext";
import { canManage } from "@/lib/userTypes";
import { Wifi, WifiOff, Printer, RefreshCw, CheckCircle, XCircle, Clock, Copy, Check } from "lucide-react";

const SECTION_STYLE: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E5E7EB",
  borderRadius: 12,
  padding: 24,
  marginBottom: 20,
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#9CA3AF",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 16,
};

function StatusChip({ status }: { status: "queued" | "claimed" | "printing" | "completed" | "failed" | "cancelled" }) {
  const colours: Record<string, { bg: string; text: string }> = {
    queued:    { bg: "#FEF3C7", text: "#92400E" },
    claimed:   { bg: "#DBEAFE", text: "#1E40AF" },
    printing:  { bg: "#EDE9FE", text: "#4C1D95" },
    completed: { bg: "#D1FAE5", text: "#065F46" },
    failed:    { bg: "#FEE2E2", text: "#991B1B" },
    cancelled: { bg: "#F3F4F6", text: "#6B7280" },
  };
  const c = colours[status] ?? colours.cancelled;
  return (
    <span style={{ padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 600, background: c.bg, color: c.text }}>
      {status}
    </span>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function BridgeOnline({ lastHeartbeat }: { lastHeartbeat: string | null }) {
  if (!lastHeartbeat) return <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "#9CA3AF" }}><WifiOff size={12} /> Never connected</span>;
  const age = Date.now() - new Date(lastHeartbeat).getTime();
  const online = age < 60_000; // within last minute
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: online ? "#10B981" : "#F59E0B" }}>
      {online ? <Wifi size={12} /> : <WifiOff size={12} />}
      {online ? "Online" : `Last seen ${fmtDate(lastHeartbeat)}`}
    </span>
  );
}

export default function RfidSettingsPage() {
  const { user, hydrated } = useUser();
  const tenantId = user?.tenantId ?? "";
  const isManager = hydrated ? canManage(user?.role) : false;

  const [data, setData]       = useState<{ printers: any[]; bridges: any[]; recent_jobs: any[]; active_tag_count: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Setup form
  const [showSetup, setShowSetup]           = useState(false);
  const [setupForm, setSetupForm]           = useState({ printer_display_name: "Zebra ZD621R", printer_model: "Zebra ZD621R", bridge_display_name: "Store Bridge" });
  const [setupSaving, setSetupSaving]       = useState(false);
  const [setupError, setSetupError]         = useState("");
  const [newApiKey, setNewApiKey]           = useState<string | null>(null);
  const [copied, setCopied]                 = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenantId) return;
    const res = await fetch("/api/rfid/admin", { headers: { "x-tenant-id": tenantId } });
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [tenantId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSetup = async () => {
    setSetupSaving(true);
    setSetupError("");
    const res = await fetch("/api/rfid/admin/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tenantId },
      body: JSON.stringify(setupForm),
    });
    const result = await res.json();
    setSetupSaving(false);
    if (!res.ok) { setSetupError(result.error ?? "Setup failed"); return; }
    setNewApiKey(result.api_key);
    setShowSetup(false);
    fetchData();
  };

  const copyKey = () => {
    if (newApiKey) {
      navigator.clipboard.writeText(newApiKey).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
    }
  };

  if (!hydrated || loading) {
    return <div style={{ padding: 32, color: "#9CA3AF", fontSize: 14 }}>Loading…</div>;
  }

  const hasPrinter = (data?.printers ?? []).length > 0;
  const hasBridge  = (data?.bridges  ?? []).length > 0;

  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: "32px 16px" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>RFID</h1>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: "#6B7280" }}>
          Configure your Zebra printer and Print Bridge for RFID tag encoding.
        </p>
      </div>

      {/* New API key banner — shown once after setup */}
      {newApiKey && (
        <div style={{ background: "#ECFDF5", border: "1px solid #6EE7B7", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700, color: "#065F46" }}>Bridge configured — save this API key</h3>
          <p style={{ margin: "0 0 12px", fontSize: 13, color: "#065F46" }}>
            This key will not be shown again. Copy it into your bridge <code>config.json</code>.
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <code style={{ flex: 1, fontFamily: "monospace", fontSize: 12, background: "#D1FAE5", padding: "8px 12px", borderRadius: 8, wordBreak: "break-all" as const, color: "#047857" }}>
              {newApiKey}
            </code>
            <button onClick={copyKey} style={{ flexShrink: 0, padding: "8px 12px", borderRadius: 8, border: "1px solid #6EE7B7", background: "#fff", color: "#065F46", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
              {copied ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
            </button>
          </div>
          <button onClick={() => setNewApiKey(null)} style={{ marginTop: 12, fontSize: 12, color: "#059669", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            I&apos;ve saved the key — dismiss
          </button>
        </div>
      )}

      {/* Status overview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Printers", value: (data?.printers ?? []).filter((p: any) => p.is_active).length, icon: <Printer size={16} /> },
          { label: "Bridges",  value: (data?.bridges  ?? []).filter((b: any) => b.is_active).length, icon: <Wifi size={16} /> },
          { label: "Tagged pieces", value: data?.active_tag_count ?? 0, icon: <CheckCircle size={16} /> },
        ].map(({ label, value, icon }) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #E5E7EB", borderRadius: 12, padding: 16, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ color: "#6B7280" }}>{icon}</div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#111827", lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Printers */}
      <div style={SECTION_STYLE}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ ...LABEL_STYLE, margin: 0 }}>Printers</h2>
          {isManager && !hasPrinter && (
            <button onClick={() => setShowSetup(true)} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", fontSize: 13, cursor: "pointer" }}>
              + Add printer &amp; bridge
            </button>
          )}
        </div>
        {(data?.printers ?? []).length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>No printers configured yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Name", "Model", "Status", "Last print"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px 8px 0", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.printers ?? []).map((p: any) => (
                <tr key={p.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 0" }}>{p.display_name}</td>
                  <td style={{ padding: "10px 0", color: "#6B7280" }}>{p.model}</td>
                  <td style={{ padding: "10px 0" }}>
                    <span style={{ color: p.is_active ? "#10B981" : "#9CA3AF", fontSize: 12 }}>
                      {p.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 0", color: "#9CA3AF" }}>{fmtDate(p.last_print_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!hasPrinter && isManager && (
          <div style={{ marginTop: 16 }}>
            <button onClick={() => setShowSetup(true)} style={{ padding: "8px 16px", borderRadius: 8, background: "#111827", color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>
              Set up printer &amp; bridge
            </button>
          </div>
        )}
      </div>

      {/* Bridge installations */}
      <div style={SECTION_STYLE}>
        <h2 style={LABEL_STYLE}>Bridge installations</h2>
        {(data?.bridges ?? []).length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>No bridge configured. Add one using the setup form above.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Name", "Status", "Version", "Last heartbeat"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px 8px 0", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.bridges ?? []).map((b: any) => (
                <tr key={b.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 0" }}>{b.display_name}</td>
                  <td style={{ padding: "10px 0" }}><BridgeOnline lastHeartbeat={b.last_heartbeat_at} /></td>
                  <td style={{ padding: "10px 0", color: "#9CA3AF", fontFamily: "monospace", fontSize: 11 }}>{b.bridge_version ?? "—"}</td>
                  <td style={{ padding: "10px 0", color: "#9CA3AF" }}>{fmtDate(b.last_heartbeat_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent print jobs */}
      <div style={SECTION_STYLE}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ ...LABEL_STYLE, margin: 0 }}>Recent print jobs</h2>
          <button onClick={fetchData} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 6, border: "1px solid #E5E7EB", background: "#F9FAFB", fontSize: 12, color: "#6B7280", cursor: "pointer" }}>
            <RefreshCw size={11} /> Refresh
          </button>
        </div>
        {(data?.recent_jobs ?? []).length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#9CA3AF" }}>No print jobs yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr>
                {["Status", "Requested", "Completed", "Error"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 8px 8px 0", fontSize: 11, fontWeight: 600, color: "#9CA3AF", textTransform: "uppercase" as const }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(data?.recent_jobs ?? []).map((j: any) => (
                <tr key={j.id} style={{ borderTop: "1px solid #F3F4F6" }}>
                  <td style={{ padding: "10px 0" }}><StatusChip status={j.status} /></td>
                  <td style={{ padding: "10px 0", color: "#6B7280" }}>{fmtDate(j.requested_at)}</td>
                  <td style={{ padding: "10px 0", color: "#9CA3AF" }}>{fmtDate(j.completed_at)}</td>
                  <td style={{ padding: "10px 0", color: "#DC2626", fontSize: 12 }}>{j.last_error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Bridge configuration reference */}
      {hasBridge && (
        <div style={{ background: "#F8FAFC", border: "1px solid #E5E7EB", borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ ...LABEL_STYLE, margin: "0 0 12px" }}>Bridge config reference</h3>
          <pre style={{ margin: 0, fontSize: 12, color: "#374151", overflowX: "auto" }}>{JSON.stringify({
            vaultApiUrl: "https://yourdomain.com",
            bridgeApiKey: "<your-api-key>",
            pollIntervalMs: 3000,
            printerHost: "192.168.40.242",
            printerPort: 9100,
          }, null, 2)}</pre>
        </div>
      )}

      {/* Setup modal */}
      {showSetup && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 32, width: "100%", maxWidth: 440, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#111827" }}>Set up printer &amp; bridge</h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6B7280" }}>Creates a printer record and generates a secure API key for your bridge to authenticate with Vault.</p>

            {[
              { key: "printer_display_name", label: "Printer name", placeholder: "Zebra ZD621R" },
              { key: "bridge_display_name",  label: "Bridge name",  placeholder: "Store Bridge" },
            ].map(({ key, label, placeholder }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 4 }}>{label}</label>
                <input
                  value={(setupForm as any)[key]}
                  onChange={e => setSetupForm(f => ({ ...f, [key]: e.target.value }))}
                  placeholder={placeholder}
                  style={{ width: "100%", boxSizing: "border-box" as const, padding: "10px 12px", borderRadius: 8, border: "1px solid #D1D5DB", fontSize: 14 }}
                />
              </div>
            ))}

            {setupError && <p style={{ margin: "0 0 14px", fontSize: 13, color: "#DC2626" }}>{setupError}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => { setShowSetup(false); setSetupError(""); }} style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #D1D5DB", background: "#fff", fontSize: 13, cursor: "pointer" }}>
                Cancel
              </button>
              <button onClick={handleSetup} disabled={setupSaving} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#111827", color: "#fff", fontSize: 13, cursor: setupSaving ? "not-allowed" : "pointer" }}>
                {setupSaving ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
