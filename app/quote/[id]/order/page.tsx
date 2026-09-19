"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AddressAutocomplete from "@/components/AddressAutocomplete";

interface StoneLink {
  video: string | null;
  image: string | null;
}

interface OrderOption {
  index: number;
  label: string;
  specs: string;
  stone_links: StoneLink[];
  quoted_price: number | null;
}

interface OrderData {
  reference_number: string;
  design: string | null;
  options: OrderOption[];
  already_confirmed: boolean;
  payment_link_url: string | null;
  terms_and_conditions: string | null;
  brand_primary_colour: string | null;
}

const AU_STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

function money(n: number | null): string {
  if (n == null) return "—";
  return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PlaceOrderPage() {
  const params = useParams();
  const id = params?.id as string;

  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedOption, setSelectedOption] = useState(0);
  const [street, setStreet] = useState("");
  const [suburb, setSuburb] = useState("");
  const [state, setState] = useState("");
  const [postcode, setPostcode] = useState("");
  const [termsChecked, setTermsChecked] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/quote/${id}/order`)
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || "Quote not found");
        return r.json();
      })
      .then((json: OrderData) => setData(json))
      .catch(err => setLoadError(err instanceof Error ? err.message : "Something went wrong"))
      .finally(() => setLoading(false));
  }, [id]);

  const brandColor = data?.brand_primary_colour || "#635BFF";
  const requiresTerms = !!data?.terms_and_conditions;
  const addressComplete = street.trim() && suburb.trim() && state.trim() && /^\d{4}$/.test(postcode.trim());
  const canSubmit = !!addressComplete && (!requiresTerms || termsChecked) && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/quote/${id}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accepted_option: selectedOption,
          address: { street, suburb, state, postcode },
          terms_accepted: requiresTerms ? termsChecked : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json.error || "Something went wrong — please try again");
        setSubmitting(false);
        return;
      }
      if (json.payment_link_url) {
        window.location.href = json.payment_link_url;
        return;
      }
      setSubmitError("Order confirmed, but no payment link was returned — please contact us to complete payment.");
      setSubmitting(false);
    } catch {
      setSubmitError("Network error — please check your connection and try again");
      setSubmitting(false);
    }
  }

  const wrap: React.CSSProperties = {
    maxWidth: 560, margin: "0 auto", padding: "32px 20px 80px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: "#1A1A2E",
  };
  const card: React.CSSProperties = {
    background: "#fff", border: "1px solid #E8E8F0", borderRadius: 12,
    padding: 20, marginBottom: 16,
  };
  const label: React.CSSProperties = { display: "block", fontSize: 13, fontWeight: 500, color: "#374151", marginBottom: 6 };
  const input: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", border: "1px solid #E8E8F0", borderRadius: 8,
    padding: "10px 12px", fontSize: 14, color: "#1A1A2E", outline: "none",
  };

  if (loading) {
    return <div style={{ ...wrap, textAlign: "center", color: "#6B7280" }}>Loading your order…</div>;
  }
  if (loadError || !data) {
    return <div style={{ ...wrap, textAlign: "center", color: "#991B1B" }}>{loadError || "Quote not found"}</div>;
  }

  if (data.already_confirmed) {
    return (
      <div style={wrap}>
        <div style={card}>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: "#1A1760", marginBottom: 8 }}>Order Confirmed</h1>
          <p style={{ fontSize: 14, color: "#374151", marginBottom: 16 }}>
            Thank you — your order ({data.reference_number}) has already been confirmed.
          </p>
          {data.payment_link_url && (
            <a
              href={data.payment_link_url}
              style={{
                display: "inline-block", padding: "10px 20px", background: brandColor, color: "#fff",
                borderRadius: 8, fontSize: 14, fontWeight: 600, textDecoration: "none",
              }}
            >
              Continue to Payment
            </a>
          )}
        </div>
      </div>
    );
  }

  const multiOption = data.options.length > 1;

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1A1760", marginBottom: 4 }}>Place Your Order</h1>
      <p style={{ fontSize: 13, color: "#9CA3AF", marginBottom: 24 }}>Quote {data.reference_number}{data.design ? ` — ${data.design}` : ""}</p>

      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760", marginBottom: 12 }}>
          {multiOption ? "Choose Your Option" : "Order Summary"}
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {data.options.map(opt => (
            <label
              key={opt.index}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                padding: "12px 14px", borderRadius: 8, cursor: multiOption ? "pointer" : "default",
                border: selectedOption === opt.index ? `2px solid ${brandColor}` : "1px solid #E8E8F0",
                background: selectedOption === opt.index ? "#EEF2FF" : "#FAFAFA",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {multiOption && (
                  <input
                    type="radio"
                    name="stone-option"
                    checked={selectedOption === opt.index}
                    onChange={() => setSelectedOption(opt.index)}
                  />
                )}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{opt.label}</div>
                  {opt.specs && <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{opt.specs}</div>}
                  {opt.stone_links.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                      {opt.stone_links.map((link, li) => (
                        <span key={li} style={{ display: "flex", gap: 8 }}>
                          {link.video && (
                            <a
                              href={link.video}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: 11, fontWeight: 600, color: brandColor, textDecoration: "none" }}
                            >
                              ▶ View Video
                            </a>
                          )}
                          {link.image && (
                            <a
                              href={link.image}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              style={{ fontSize: 11, fontWeight: 600, color: brandColor, textDecoration: "none" }}
                            >
                              🖼 View Photo
                            </a>
                          )}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: brandColor, whiteSpace: "nowrap" }}>{money(opt.quoted_price)}</div>
            </label>
          ))}
        </div>
      </div>

      <div style={{ ...card, background: "#FFFBEB", borderColor: "#FDE68A" }}>
        <p style={{ fontSize: 13, color: "#92400E", lineHeight: 1.6 }}>
          Stone availability is not guaranteed until your order is confirmed. If your selected stone becomes
          unavailable before then, we will source the closest equivalent stone available and contact you to confirm.
        </p>
      </div>

      <div style={card}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760", marginBottom: 12 }}>Delivery Address</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={label}>Street Address</label>
            <AddressAutocomplete
              value={street}
              onChange={setStreet}
              onSelect={({ street: s, suburb: sub, state: st, postcode: pc }) => {
                if (s) setStreet(s);
                // Always set suburb/state/postcode even if empty so autocomplete clears stale values
                setSuburb(sub);
                setState(st);
                setPostcode(pc);
              }}
              placeholder="123 Example Street"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
            <div>
              <label style={label}>Suburb</label>
              <input style={input} type="text" value={suburb} onChange={e => setSuburb(e.target.value)} placeholder="Walkerville" />
            </div>
            <div>
              <label style={label}>State</label>
              <select style={input} value={state} onChange={e => setState(e.target.value)}>
                <option value="">Select…</option>
                {AU_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Postcode</label>
              <input style={input} type="text" inputMode="numeric" maxLength={4} value={postcode} onChange={e => setPostcode(e.target.value.replace(/\D/g, ""))} placeholder="5081" />
            </div>
          </div>
        </div>
      </div>

      {requiresTerms && (
        <div style={card}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1A1760", marginBottom: 12 }}>Terms & Conditions</h2>
          <div style={{
            maxHeight: 160, overflowY: "auto", fontSize: 12.5, color: "#374151", lineHeight: 1.6,
            border: "1px solid #E8E8F0", borderRadius: 8, padding: 12, marginBottom: 12, whiteSpace: "pre-wrap",
          }}>
            {data.terms_and_conditions}
          </div>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#374151", cursor: "pointer" }}>
            <input type="checkbox" checked={termsChecked} onChange={e => setTermsChecked(e.target.checked)} style={{ marginTop: 2 }} />
            I have read and agree to the Terms & Conditions
          </label>
        </div>
      )}

      {submitError && (
        <div style={{ ...card, background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B", fontSize: 13 }}>
          {submitError}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        style={{
          width: "100%", padding: "14px 20px", borderRadius: 10, border: "none",
          background: canSubmit ? brandColor : "#E8E8F0", color: canSubmit ? "#fff" : "#9CA3AF",
          fontSize: 15, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed",
        }}
      >
        {submitting ? "Placing Order…" : "Place Order & Continue to Payment"}
      </button>
    </div>
  );
}
