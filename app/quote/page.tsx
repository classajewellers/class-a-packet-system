"use client";

import { useState, useCallback } from "react";
import { QuoteFormData, QuoteType, LineItem, Quote } from "@/lib/types";
import { defaultFollowUpDate } from "@/lib/pipeline";
import NavBar from "@/components/NavBar";
import QuoteTypeSelector from "@/components/QuoteTypeSelector";
import QuoteCustomerSection from "@/components/QuoteCustomerSection";
import QuoteLineItems from "@/components/QuoteLineItems";
import QuoteSuccessScreen from "@/components/QuoteSuccessScreen";

// Default 3 blank rows so staff can start filling immediately
const DEFAULT_LINE_ITEMS: LineItem[] = [
  { design: "", stone: "", price: "" },
  { design: "", stone: "", price: "" },
  { design: "", stone: "", price: "" },
];

function makeDefaultFormData(): QuoteFormData {
  return {
    quote_type:          "",
    customer_first_name: "",
    customer_last_name:  "",
    customer_email:      "",
    customer_phone:      "",
    line_items:          [...DEFAULT_LINE_ITEMS],
    notes:               "",
    staff_member:        "",
    follow_up_date:      defaultFollowUpDate(),
  };
}

function validate(data: QuoteFormData): Partial<Record<keyof QuoteFormData, string>> {
  const errors: Partial<Record<keyof QuoteFormData, string>> = {};
  if (!data.quote_type)                      errors.quote_type          = "Select a quote type";
  if (!data.customer_first_name.trim())      errors.customer_first_name = "Required";
  if (!data.customer_last_name.trim())       errors.customer_last_name  = "Required";
  if (!data.staff_member)                    errors.staff_member        = "Required";
  return errors;
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 bg-[#A3B2A4]">
        <h2 className="text-sm font-semibold tracking-wide text-white uppercase">{title}</h2>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  );
}

export default function QuoteFormPage() {
  const [formData, setFormData]       = useState<QuoteFormData>(makeDefaultFormData());
  const [errors, setErrors]           = useState<Partial<Record<keyof QuoteFormData, string>>>({});
  const [submitting, setSubmitting]   = useState(false);
  const [submittedQuote, setSubmittedQuote] = useState<Quote | null>(null);

  const handleChange = useCallback(
    (field: keyof QuoteFormData, value: string) => {
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

  function handleTypeChange(type: QuoteType) {
    setFormData((prev) => ({ ...prev, quote_type: type }));
    setErrors((prev) => { const n = { ...prev }; delete n.quote_type; return n; });
  }

  function handleLineItemsChange(lineItems: LineItem[]) {
    setFormData((prev) => ({ ...prev, line_items: lineItems }));
  }

  async function handleSubmit() {
    const validationErrors = validate(formData);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/quotes/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ formData }),
      });
      const json = await res.json();

      if (!res.ok || !json.quote) {
        const errMsg = json.error || "Submission failed";
        alert(`Error: ${errMsg}`);
        setSubmitting(false);
        return;
      }

      setSubmittedQuote(json.quote as Quote);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      alert(`Unexpected error: ${msg}`);
      setSubmitting(false);
    }
  }

  function handleNew() {
    setFormData(makeDefaultFormData());
    setErrors({});
    setSubmittedQuote(null);
    setSubmitting(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submittedQuote) {
    return <QuoteSuccessScreen quote={submittedQuote} onNew={handleNew} />;
  }

  return (
    <>
      <NavBar />

      <main className="max-w-3xl mx-auto px-4 py-6 pb-32 space-y-4">

        {/* Step 1 — Quote Type */}
        <Card title="Step 1 — Quote Type">
          <QuoteTypeSelector value={formData.quote_type} onChange={handleTypeChange} />
          {errors.quote_type && (
            <p className="mt-2 text-xs text-red-600">{errors.quote_type}</p>
          )}
        </Card>

        {formData.quote_type && (
          <>
            {/* Customer & Staff */}
            <Card title="Customer & Staff">
              <QuoteCustomerSection
                data={formData}
                onChange={handleChange}
                errors={errors}
              />
            </Card>

            {/* Line Items */}
            <Card title="Line Items">
              <QuoteLineItems
                lineItems={formData.line_items}
                onChange={handleLineItemsChange}
              />
            </Card>

            {/* Notes */}
            <Card title="Notes">
              <textarea
                value={formData.notes}
                onChange={(e) => handleChange("notes", e.target.value)}
                rows={3}
                placeholder="Any additional notes for the customer (optional)…"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
              />
            </Card>
          </>
        )}
      </main>

      {/* Fixed submit bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !formData.quote_type}
            className="w-full rounded-xl bg-black py-4 text-base font-bold text-white shadow-md hover:bg-[#222222] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Generating Quote…" : "Generate Quote"}
          </button>
        </div>
      </div>
    </>
  );
}
