"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  PacketFormData,
  PacketType,
  defaultFormData,
  SubmissionResults,
  Packet,
  Quote,
} from "@/lib/types";
import { todayISO } from "@/lib/formatters";
import { printLabel } from "@/lib/dymo";
import NavBar from "@/components/NavBar";
import PacketTypeSelector from "@/components/PacketTypeSelector";
import CustomerSection from "@/components/CustomerSection";
import ValueContactSection from "@/components/ValueContactSection";
import ArticlesSection from "@/components/ArticlesSection";
import PricingSection from "@/components/PricingSection";
import DatesSection from "@/components/DatesSection";
import ReferralStaffSection from "@/components/ReferralStaffSection";
import RepairFields from "@/components/RepairFields";
import CustomOrderFields from "@/components/CustomOrderFields";
import LaybyFields from "@/components/LaybyFields";
import ClientIntakeFields from "@/components/ClientIntakeFields";
import OnlineOrderFields from "@/components/OnlineOrderFields";
import LabelPreview from "@/components/LabelPreview";
import SubmissionOverlay from "@/components/SubmissionOverlay";
import SuccessScreen from "@/components/SuccessScreen";

function validate(data: PacketFormData): Partial<Record<keyof PacketFormData, string>> {
  const errors: Partial<Record<keyof PacketFormData, string>> = {};
  if (!data.packet_type) errors.packet_type = "Select an order type";
  if (!data.customer_first_name.trim()) errors.customer_first_name = "Required";
  if (!data.customer_last_name.trim()) errors.customer_last_name = "Required";
  if (!data.customer_phone.trim()) errors.customer_phone = "Required";
  if (!data.customer_email.trim()) errors.customer_email = "Required";
  if (!data.contact_preference.length)
    errors.contact_preference = "Select at least one contact preference";
  if (data.packet_type !== "online_order") {
    if (!data.articles.trim()) errors.articles = "Required";
    if (!data.instructions.trim()) errors.instructions = "Required";
  }
  if (!data.due_date && data.packet_type !== "client_intake")
    errors.due_date = "Required";
  if (!data.staff_member) errors.staff_member = "Required";
  if (data.packet_type === "layby") {
    if (!data.layby_schedule) errors.layby_schedule = "Select a schedule";
    if (!data.number_of_payments || parseInt(data.number_of_payments) < 1)
      errors.number_of_payments = "Enter number of payments";
    if (!data.terms_accepted)
      errors.terms_accepted = "Customer must accept layby terms";
  }
  if (data.packet_type === "online_order") {
    if (!data.order_number.trim()) errors.order_number = "Required";
  }
  return errors;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-[#A3B2A4]">
        <h2 className="text-sm font-semibold tracking-wide text-white uppercase">
          {title}
        </h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

function PacketFormPageInner() {
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState<PacketFormData>({
    ...defaultFormData,
    in_date: todayISO(),
    from_date: todayISO(),
  });
  const [errors, setErrors] = useState<Partial<Record<keyof PacketFormData, string>>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<SubmissionResults>({
    supabase: "pending",
    label: "pending",
    klaviyo: "pending",
    email: "pending",
    sms: "pending",
    sheets: "pending",
  });
  const [submittedPacket, setSubmittedPacket] = useState<Packet | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [fromQuoteRef, setFromQuoteRef] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // Pre-fill from quote if from_quote param is present
  useEffect(() => {
    const fromQuoteId = searchParams.get("from_quote");
    if (!fromQuoteId) return;

    fetch(`/api/quotes/${fromQuoteId}`)
      .then((r) => r.json())
      .then((json: { quote?: Quote }) => {
        if (!json.quote) return;
        const q = json.quote;

        // Build articles: item_description + formatted line items
        const lineItemsText = (q.line_items ?? []).length > 0
          ? "\n\nLine Items:\n" + (q.line_items ?? []).map((li) => `${li.item} — ${li.stone} — ${li.price}`).join("\n")
          : "";
        const articles = (q.item_description ?? "") + lineItemsText;

        // Build instructions: type-specific fields + metal/stone for custom orders
        let instructions = q.repair_description ?? q.design_brief ?? "";
        if (q.quote_type === "custom_order") {
          if (q.metal_type) instructions += (instructions ? "\n\n" : "") + `Metal: ${q.metal_type}`;
          if (q.stone_details) instructions += (instructions ? "\n" : "") + `Stone: ${q.stone_details}`;
        }

        setFromQuoteRef(q.reference_number);
        setFormData((prev) => ({
          ...prev,
          customer_first_name: q.customer_first_name ?? prev.customer_first_name,
          customer_last_name: q.customer_last_name ?? prev.customer_last_name,
          customer_email: q.customer_email ?? prev.customer_email,
          customer_phone: q.customer_phone ?? prev.customer_phone,
          articles: articles || prev.articles,
          instructions: instructions || prev.instructions,
          total_charges: q.total != null ? String(q.total) : prev.total_charges,
          staff_member: q.assigned_to ?? prev.staff_member,
          packet_type:
            q.quote_type === "repair"
              ? "repair"
              : q.quote_type === "custom_order"
              ? "custom_order"
              : prev.packet_type,
          from_quote_id: q.id,
        }));
      })
      .catch(() => {/* ignore fetch errors */});
  }, [searchParams]);

  const handleChange = useCallback(
    (field: keyof PacketFormData, value: string | boolean | string[]) => {
      setFormData((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => {
        if (!prev[field]) return prev;
        const next = { ...prev };
        delete next[field];
        return next;
      });
    },
    []
  );

  function handleTypeChange(type: PacketType) {
    setFormData((prev) => ({ ...prev, packet_type: type }));
    setErrors((prev) => { const n = { ...prev }; delete n.packet_type; return n; });
  }

  async function handleSubmit() {
    const validationErrors = validate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setTimeout(() => {
        formRef.current?.querySelector("[data-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    setSubmitting(true);
    setResults({ supabase: "pending", label: "pending", klaviyo: "pending", email: "pending", sms: "pending", sheets: "pending" });

    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData }),
      });
      const json = await res.json();

      if (!res.ok || !json.packet) {
        const errMsg = Object.values(json.errors ?? {}).join(", ") || "Submission failed";
        setResults((r) => ({ ...r, supabase: "failed", klaviyo: "failed", email: "failed", sms: "failed", sheets: "failed" }));
        alert(`Error: ${errMsg}`);
        setSubmitting(false);
        return;
      }

      const packet: Packet = json.packet;
      setSubmittedPacket(packet);
      setResults((r) => ({
        ...r,
        supabase: "success",
        klaviyo: json.results.klaviyo,
        email: json.results.email,
        sms: json.results.sms,
        sheets: json.results.sheets,
      }));

      // Client-side Dymo print
      setResults((r) => ({ ...r, label: "pending" }));
      const printed = await printLabel(packet);
      setResults((r) => ({ ...r, label: printed ? "success" : "failed" }));

      if (printed) {
        fetch("/api/admin/packets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: packet.id, updates: { label_printed: true } }),
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 800));
      setShowSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Unexpected error: ${msg}`);
      setSubmitting(false);
    }
  }

  async function handleRetry(output: "klaviyo" | "email" | "sms" | "sheets" | "label") {
    if (!submittedPacket) return;
    if (output === "label") {
      const printed = await printLabel(submittedPacket);
      if (printed) {
        fetch("/api/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packetId: submittedPacket.id, output: "label" }),
        });
        setResults((r) => ({ ...r, label: "success" }));
      }
      return;
    }
    const res = await fetch("/api/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packetId: submittedPacket.id, output }),
    });
    if (res.ok) setResults((r) => ({ ...r, [output]: "success" }));
  }

  function handleNewPacket() {
    setFormData({ ...defaultFormData, in_date: todayISO(), from_date: todayISO() });
    setErrors({});
    setSubmittedPacket(null);
    setShowSuccess(false);
    setSubmitting(false);
    setFromQuoteRef(null);
    setResults({ supabase: "pending", label: "pending", klaviyo: "pending", email: "pending", sms: "pending", sheets: "pending" });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePrintAgain() {
    if (submittedPacket) await printLabel(submittedPacket);
  }

  return (
    <>
      {submitting && !showSuccess && <SubmissionOverlay results={results} />}
      {showSuccess && submittedPacket && (
        <SuccessScreen
          packet={submittedPacket}
          results={results}
          onPrintAgain={handlePrintAgain}
          onNewPacket={handleNewPacket}
          onRetry={handleRetry}
        />
      )}

      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-6 pb-32">
        {fromQuoteRef && (
          <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-300 px-4 py-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm font-semibold text-emerald-800">
              Pre-filled from Quote {fromQuoteRef} — review and submit when ready
            </p>
          </div>
        )}
        <div className="lg:flex lg:gap-6">
          {/* Form column */}
          <div className="flex-1 min-w-0 space-y-4" ref={formRef}>
            <Card title="Step 1 — Order Type">
              <PacketTypeSelector value={formData.packet_type} onChange={handleTypeChange} />
              {errors.packet_type && (
                <p className="mt-2 text-xs text-red-600" data-error>{errors.packet_type}</p>
              )}
            </Card>

            {formData.packet_type && (
              <>
                <Card title="Customer">
                  <CustomerSection
                    data={formData}
                    onChange={(f, v) => handleChange(f, v as string)}
                    errors={errors}
                  />
                </Card>

                <Card title="Valuation & Contact">
                  <ValueContactSection
                    data={formData}
                    onChange={(f, v) => handleChange(f, v as boolean | string[])}
                    errors={errors}
                  />
                </Card>

                {formData.packet_type !== "online_order" && (
                  <Card title="Articles & Instructions">
                    <ArticlesSection
                      data={formData}
                      onChange={(f, v) => handleChange(f, v as string)}
                      errors={errors}
                    />
                  </Card>
                )}

                <Card title="Pricing">
                  <PricingSection
                    data={formData}
                    onChange={(f, v) => handleChange(f, v as string)}
                    errors={errors}
                  />
                </Card>

                <Card title="Dates">
                  <DatesSection
                    data={formData}
                    onChange={(f, v) => handleChange(f, v as string)}
                    errors={errors}
                  />
                </Card>

                <Card title="Referral & Staff">
                  <ReferralStaffSection
                    data={formData}
                    onChange={(f, v) => handleChange(f, v as string)}
                    errors={errors}
                  />
                </Card>

                {formData.packet_type === "repair" && (
                  <Card title="Repair Details">
                    <RepairFields
                      data={formData}
                      onChange={(f, v) => handleChange(f, v as string)}
                      repairTrackerNumber={submittedPacket?.repair_tracker_number ?? undefined}
                    />
                  </Card>
                )}

                {formData.packet_type === "custom_order" && (
                  <Card title="Custom Order Details">
                    <CustomOrderFields
                      data={formData}
                      onChange={(f, v) => handleChange(f, v as string)}
                    />
                  </Card>
                )}

                {formData.packet_type === "layby" && (
                  <Card title="Layby Details">
                    <LaybyFields
                      data={formData}
                      onChange={(f, v) => handleChange(f, v as string | boolean)}
                      errors={errors}
                    />
                  </Card>
                )}

                {formData.packet_type === "client_intake" && (
                  <Card title="Client Intake Details">
                    <ClientIntakeFields
                      data={formData}
                      onChange={(f, v) => handleChange(f, v as string | string[] | boolean)}
                      errors={errors}
                    />
                  </Card>
                )}

                {formData.packet_type === "online_order" && (
                  <Card title="Online Order Details">
                    <OnlineOrderFields
                      data={formData}
                      onChange={(f, v) => handleChange(f, v as string | boolean)}
                      errors={errors}
                    />
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Sticky label preview — landscape iPad / desktop */}
          {formData.packet_type && (
            <div className="hidden lg:block w-72 flex-shrink-0">
              <div className="sticky top-20">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                  Label Preview
                </p>
                <LabelPreview data={formData} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Mobile preview toggle button */}
      {formData.packet_type && (
        <div className="lg:hidden fixed bottom-20 right-4 z-20">
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="bg-[#A3B2A4] text-white rounded-full shadow-lg p-3"
            title="Toggle label preview"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      )}

      {/* Mobile preview sheet */}
      {showPreview && formData.packet_type && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 flex items-end"
          onClick={() => setShowPreview(false)}
        >
          <div
            className="w-full bg-white rounded-t-2xl p-4 max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-black">Label Preview</p>
              <button onClick={() => setShowPreview(false)} className="text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <LabelPreview data={formData} />
          </div>
        </div>
      )}

      {/* Fixed submit bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
        <div className="max-w-5xl mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !formData.packet_type}
            className="w-full rounded-xl bg-black py-4 text-base font-bold text-white shadow-md hover:bg-[#222222] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Submitting…" : "Submit & Print"}
          </button>
        </div>
      </div>
    </>
  );
}

export default function PacketFormPage() {
  return (
    <Suspense>
      <PacketFormPageInner />
    </Suspense>
  );
}
