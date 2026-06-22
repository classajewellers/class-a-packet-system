"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/context/UserContext";

export const dynamic = "force-dynamic";

interface StoreForm {
  store_name: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  bank_name: string;
  account_name: string;
  bsb: string;
  account_number: string;
}

interface PricingForm {
  gold_9ct: string;
  gold_18ct: string;
  silver: string;
  platinum: string;
  gst_registered: boolean;
}

interface InviteRow {
  name: string;
  email: string;
  role: "manager" | "staff";
}

interface VipTier {
  id: string;
  tier_name: string;
  tier_order: number;
  min_spend: number;
  min_orders: number;
  colour: string;
}

const PRIMARY = "#635BFF";

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid #E8E8F0",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 14,
  color: "#1A1A2E",
  outline: "none",
  background: "#fff",
  boxSizing: "border-box",
  fontFamily: "Inter, system-ui, sans-serif",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#374151",
  marginBottom: 6,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #E8E8F0",
  borderRadius: 12,
  padding: 24,
};

const sectionLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#9CA3AF",
  textTransform: "uppercase" as const,
  letterSpacing: "0.07em",
  marginBottom: 16,
  marginTop: 0,
};

const btnPrimary: React.CSSProperties = {
  background: PRIMARY,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "11px 28px",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  fontFamily: "Inter, system-ui, sans-serif",
};

const btnSecondary: React.CSSProperties = {
  background: "#fff",
  color: "#374151",
  border: "1px solid #E8E8F0",
  borderRadius: 8,
  padding: "11px 24px",
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "Inter, system-ui, sans-serif",
};

function Field({
  label,
  required,
  children,
  half,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  half?: boolean;
}) {
  return (
    <div style={{ flex: half ? "0 0 calc(50% - 8px)" : "1 1 100%" }}>
      <label style={labelStyle}>
        {label}
        {required && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={inputStyle}
    />
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0 }}>
      {Array.from({ length: total }, (_, i) => {
        const n = i + 1;
        const done   = n < current;
        const active = n === current;
        return (
          <div key={n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{
              width: active ? 32 : 10,
              height: 10,
              borderRadius: 5,
              background: done || active ? PRIMARY : "#E8E8F0",
              transition: "width 0.25s ease, background 0.2s ease",
            }} />
            {n < total && (
              <div style={{ width: 16, height: 2, background: done ? PRIMARY : "#E8E8F0" }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1({
  form,
  onChange,
  onNext,
  saving,
}: {
  form: StoreForm;
  onChange: (k: keyof StoreForm, v: string) => void;
  onNext: () => void;
  saving: boolean;
}) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: "0 0 6px" }}>Store Details</h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
          Tell us about your store. This appears on customer documents and invoices.
        </p>
      </div>

      <div style={cardStyle}>
        <p style={sectionLabel}>Store Info</p>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 16 }}>
          <Field label="Store Name" required half>
            <TextInput value={form.store_name} onChange={v => onChange("store_name", v)} placeholder="Class A Jewellers" />
          </Field>
          <Field label="Phone" half>
            <TextInput value={form.phone} onChange={v => onChange("phone", v)} placeholder="+61 8 8000 0000" type="tel" />
          </Field>
          <Field label="Email" half>
            <TextInput value={form.email} onChange={v => onChange("email", v)} placeholder="hello@yourstore.com.au" type="email" />
          </Field>
          <Field label="Website" half>
            <TextInput value={form.website} onChange={v => onChange("website", v)} placeholder="https://yourstore.com.au" />
          </Field>
          <Field label="Address">
            <TextInput value={form.address} onChange={v => onChange("address", v)} placeholder="123 King William St, Adelaide SA 5000" />
          </Field>
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <p style={sectionLabel}>Payment Details <span style={{ fontWeight: 400, textTransform: "none" as const, fontSize: 11 }}>(shown on invoices)</span></p>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 16 }}>
          <Field label="Bank Name" half>
            <TextInput value={form.bank_name} onChange={v => onChange("bank_name", v)} placeholder="Commonwealth Bank" />
          </Field>
          <Field label="Account Name" half>
            <TextInput value={form.account_name} onChange={v => onChange("account_name", v)} placeholder="Your Store Pty Ltd" />
          </Field>
          <Field label="BSB" half>
            <TextInput value={form.bsb} onChange={v => onChange("bsb", v)} placeholder="063-123" />
          </Field>
          <Field label="Account Number" half>
            <TextInput value={form.account_number} onChange={v => onChange("account_number", v)} placeholder="12345678" />
          </Field>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
        <button onClick={onNext} style={btnPrimary} disabled={saving}>
          {saving ? "Saving…" : "Next →"}
        </button>
      </div>
    </>
  );
}

function Step2({
  form,
  onChange,
  onNext,
  onBack,
  saving,
}: {
  form: PricingForm;
  onChange: (k: keyof PricingForm, v: string | boolean) => void;
  onNext: () => void;
  onBack: () => void;
  saving: boolean;
}) {
  const metalField = (label: string, key: keyof PricingForm) => (
    <Field label={label} half>
      <div style={{ position: "relative" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9CA3AF", fontSize: 14 }}>$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          value={form[key] as string}
          onChange={e => onChange(key, e.target.value)}
          style={{ ...inputStyle, paddingLeft: 24 }}
        />
      </div>
    </Field>
  );

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: "0 0 6px" }}>Pricing Defaults</h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
          Set your metal spot prices (per gram) for the quote builder. You can update these anytime in Settings → Pricing.
        </p>
      </div>

      <div style={cardStyle}>
        <p style={sectionLabel}>Metal Rates ($ per gram)</p>
        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 16 }}>
          {metalField("9ct Gold", "gold_9ct")}
          {metalField("18ct Gold", "gold_18ct")}
          {metalField("Sterling Silver", "silver")}
          {metalField("Platinum", "platinum")}
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <p style={sectionLabel}>Tax Settings</p>
        <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.gst_registered}
            onChange={e => onChange("gst_registered", e.target.checked)}
            style={{ width: 18, height: 18, accentColor: PRIMARY, cursor: "pointer", flexShrink: 0 }}
          />
          <span style={{ fontSize: 14, color: "#1A1A2E" }}>
            <strong>GST Registered</strong> — 10% GST will be shown on quotes and invoices
          </span>
        </label>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button onClick={onBack} style={btnSecondary}>← Back</button>
        <button onClick={onNext} style={btnPrimary} disabled={saving}>
          {saving ? "Saving…" : "Next →"}
        </button>
      </div>
    </>
  );
}

function Step3({
  tiers,
  loading,
  onNext,
  onBack,
}: {
  tiers: VipTier[];
  loading: boolean;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: "0 0 6px" }}>VIP Tiers</h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
          We&apos;ve set up default loyalty tiers for your customers. Customise thresholds anytime in Settings → VIP Tiers.
        </p>
      </div>

      <div style={cardStyle}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "32px 0", color: "#9CA3AF", fontSize: 14 }}>
            Setting up tiers…
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {tiers.map(tier => (
              <div key={tier.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "#F9FAFB", borderRadius: 8 }}>
                <div style={{ width: 12, height: 12, borderRadius: "50%", background: tier.colour, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>{tier.tier_name}</span>
                  <span style={{ fontSize: 13, color: "#9CA3AF", marginLeft: 10 }}>
                    ${tier.min_spend.toLocaleString()}+ spend
                    <span style={{ margin: "0 5px", color: "#D1D5DB" }}>or</span>
                    {tier.min_orders}+ orders
                  </span>
                </div>
                <span style={{
                  fontSize: 10,
                  fontWeight: 700,
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.08em",
                  background: `${tier.colour}22`,
                  color: tier.colour,
                  padding: "3px 10px",
                  borderRadius: 999,
                }}>
                  {tier.tier_name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
        <button onClick={onBack} style={btnSecondary}>← Back</button>
        <button onClick={onNext} style={btnPrimary} disabled={loading}>Next →</button>
      </div>
    </>
  );
}

function Step4({
  invites,
  onChangeInvite,
  onAddInvite,
  onNext,
  onBack,
  onSkip,
  saving,
}: {
  invites: InviteRow[];
  onChangeInvite: (i: number, k: keyof InviteRow, v: string) => void;
  onAddInvite: () => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  saving: boolean;
}) {
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: "none" as const,
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%236B7280'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 10px center",
    backgroundSize: 16,
    paddingRight: 32,
    cursor: "pointer",
  };

  return (
    <>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1A1A2E", margin: "0 0 6px" }}>Invite Your Team</h2>
        <p style={{ fontSize: 14, color: "#6B7280", margin: 0 }}>
          Add staff members so they can start using Vault. They&apos;ll receive an email to set their password.
        </p>
      </div>

      <div style={cardStyle}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {invites.map((invite, i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" as const }}>
              <div style={{ flex: "1 1 150px" }}>
                <label style={labelStyle}>Full Name</label>
                <TextInput value={invite.name} onChange={v => onChangeInvite(i, "name", v)} placeholder="Jane Smith" />
              </div>
              <div style={{ flex: "1 1 190px" }}>
                <label style={labelStyle}>Email</label>
                <TextInput value={invite.email} onChange={v => onChangeInvite(i, "email", v)} placeholder="jane@example.com" type="email" />
              </div>
              <div style={{ flex: "0 0 130px" }}>
                <label style={labelStyle}>Access</label>
                <select
                  value={invite.role}
                  onChange={e => onChangeInvite(i, "role", e.target.value)}
                  style={selectStyle}
                >
                  <option value="staff">Staff</option>
                  <option value="manager">Manager</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        {invites.length < 5 && (
          <button
            onClick={onAddInvite}
            style={{ background: "none", border: "none", color: PRIMARY, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "12px 0 0", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}
          >
            + Add another
          </button>
        )}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 24 }}>
        <button onClick={onBack} style={btnSecondary}>← Back</button>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={onSkip} style={{ background: "none", border: "none", color: "#9CA3AF", fontSize: 13, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}>
            Skip
          </button>
          <button onClick={onNext} style={btnPrimary} disabled={saving}>
            {saving ? "Sending…" : "Send Invites →"}
          </button>
        </div>
      </div>
    </>
  );
}

function Step5({
  storeName,
  onComplete,
  saving,
}: {
  storeName: string;
  onComplete: () => void;
  saving: boolean;
}) {
  const items = [
    { icon: "🏪", label: "Store details",   sub: "Name, contact info, and payment details" },
    { icon: "💰", label: "Metal prices",    sub: "Gold, silver, and platinum per-gram rates" },
    { icon: "⭐", label: "VIP tiers",       sub: "Loyalty tiers ready for your customers" },
    { icon: "👥", label: "Team invited",    sub: "Staff invites sent to join Vault" },
  ];

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 16 }}>🎉</div>
        <h2 style={{ fontSize: 24, fontWeight: 700, color: "#1A1A2E", margin: "0 0 8px" }}>You&apos;re all set!</h2>
        <p style={{ fontSize: 15, color: "#6B7280", margin: 0 }}>
          {storeName ? `${storeName} is` : "Your store is"} ready to use Vault.
        </p>
      </div>

      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <p style={sectionLabel}>What&apos;s been configured</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ fontSize: 20, flexShrink: 0 }}>{item.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1A1A2E" }}>{item.label}</div>
                <div style={{ fontSize: 12, color: "#9CA3AF" }}>{item.sub}</div>
              </div>
              <svg width={18} height={18} fill="none" stroke="#10B981" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onComplete}
        disabled={saving}
        style={{ ...btnPrimary, width: "100%", justifyContent: "center", padding: "14px 28px", fontSize: 15, boxSizing: "border-box" }}
      >
        {saving ? "Launching…" : "Take me to my dashboard →"}
      </button>
    </>
  );
}

export default function OnboardingPage() {
  const { user, hydrated } = useUser();
  const router = useRouter();

  const [step, setStep]       = useState(1);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const checkedRef = useRef(false);

  const [store, setStore] = useState<StoreForm>({
    store_name: "", phone: "", email: "", address: "", website: "",
    bank_name: "", account_name: "", bsb: "", account_number: "",
  });

  const [pricing, setPricing] = useState<PricingForm>({
    gold_9ct: "42.00", gold_18ct: "85.00", silver: "1.00", platinum: "120.00",
    gst_registered: true,
  });

  const [vipTiers, setVipTiers]         = useState<VipTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(false);

  const [invites, setInvites] = useState<InviteRow[]>([
    { name: "", email: "", role: "staff" },
  ]);

  const tid = user?.tenantId ?? "";

  useEffect(() => {
    if (!hydrated || !user || checkedRef.current) return;
    checkedRef.current = true;

    fetch("/api/onboarding/status", { headers: { "x-tenant-id": tid } })
      .then(r => r.json())
      .then(data => {
        if (data.onboarding_complete) {
          router.replace("/dashboard");
          return;
        }
        if (data.onboarding_step > 0) {
          setStep(Math.min(data.onboarding_step + 1, 5));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [hydrated, user, router, tid]);

  useEffect(() => {
    if (step !== 3 || !user || tiersLoading || vipTiers.length > 0) return;
    setTiersLoading(true);
    fetch("/api/onboarding/vip-tiers", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
    })
      .then(r => r.json())
      .then(data => setVipTiers(data.tiers ?? []))
      .catch(() => {})
      .finally(() => setTiersLoading(false));
  }, [step, user, tiersLoading, vipTiers.length, tid]);

  async function handleStep1Next() {
    if (!store.store_name.trim()) { setError("Store name is required."); return; }
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/store", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": tid },
        body: JSON.stringify(store),
      });
      if (!res.ok) { setError("Failed to save store details."); return; }
      setStep(2);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStep2Next() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/onboarding/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tid },
        body: JSON.stringify(pricing),
      });
      if (!res.ok) { setError("Failed to save pricing."); return; }
      setStep(3);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStep4Next() {
    setError(null);
    const toInvite = invites.filter(i => i.name.trim() && i.email.trim());
    if (toInvite.length === 0) { await handleStep4Skip(); return; }
    setSaving(true);
    try {
      await fetch("/api/onboarding/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-id": tid },
        body: JSON.stringify({ invites: toInvite }),
      });
      setStep(5);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleStep4Skip() {
    await fetch("/api/onboarding/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      body: JSON.stringify({ invites: [] }),
    }).catch(() => {});
    setStep(5);
  }

  async function handleComplete() {
    setSaving(true);
    try {
      try {
        await fetch("/api/billing/create-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-tenant-id": tid },
          body: JSON.stringify({
            plan: "founding",
            email: store.email || "",
            store_name: store.store_name,
          }),
        });
      } catch { /* ignore billing errors */ }

      await fetch("/api/onboarding/complete", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-id": tid },
      });
      router.push("/dashboard");
    } catch {
      setError("Network error — please try again.");
      setSaving(false);
    }
  }

  if (!hydrated || loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#F9FAFB", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#9CA3AF", fontSize: 14, fontFamily: "Inter, system-ui, sans-serif" }}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#F9FAFB", padding: "48px 16px 80px", fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.04em", color: PRIMARY }}>◆ Vault</div>
          <div style={{ fontSize: 13, color: "#9CA3AF", marginTop: 4 }}>Store setup · Step {step} of 5</div>
        </div>

        <div style={{ marginBottom: 40 }}>
          <StepDots current={step} total={5} />
        </div>

        {error && (
          <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "#DC2626" }}>
            {error}
          </div>
        )}

        {step === 1 && (
          <Step1
            form={store}
            onChange={(k, v) => setStore(s => ({ ...s, [k]: v }))}
            onNext={handleStep1Next}
            saving={saving}
          />
        )}
        {step === 2 && (
          <Step2
            form={pricing}
            onChange={(k, v) => setPricing(s => ({ ...s, [k]: v }))}
            onNext={handleStep2Next}
            onBack={() => { setError(null); setStep(1); }}
            saving={saving}
          />
        )}
        {step === 3 && (
          <Step3
            tiers={vipTiers}
            loading={tiersLoading}
            onNext={() => { setError(null); setStep(4); }}
            onBack={() => { setError(null); setStep(2); }}
          />
        )}
        {step === 4 && (
          <Step4
            invites={invites}
            onChangeInvite={(i, k, v) =>
              setInvites(prev => {
                const next = [...prev];
                next[i] = { ...next[i], [k]: v as "manager" | "staff" };
                return next;
              })
            }
            onAddInvite={() => setInvites(prev => [...prev, { name: "", email: "", role: "staff" }])}
            onNext={handleStep4Next}
            onBack={() => { setError(null); setStep(3); }}
            onSkip={handleStep4Skip}
            saving={saving}
          />
        )}
        {step === 5 && (
          <Step5
            storeName={store.store_name}
            onComplete={handleComplete}
            saving={saving}
          />
        )}
      </div>
    </div>
  );
}
