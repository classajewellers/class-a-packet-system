"use client";

import { useState, useCallback } from "react";
import { QuoteFormData, QuoteType, LineItem, Quote } from "@/lib/types";
import { formatCurrency } from "@/lib/formatters";
import NavBar from "@/components/NavBar";
import QuoteTypeSelector from "@/components/QuoteTypeSelector";
import QuoteCustomerSection from "@/components/QuoteCustomerSection";
import QuoteLineItems from "@/components/QuoteLineItems";
import QuoteRepairFields from "@/components/QuoteRepairFields";
import QuoteCustomOrderFields from "@/components/QuoteCustomOrderFields";
import QuoteSuccessScreen from "@/components/QuoteSuccessScreen";

const DEFAULT_FORM_DATA: QuoteFormData = {
  quote_type: "",
  customer_first_name: "",
  customer_last_name: "",
  customer_email: "",
  customer_phone: "",
  item_description: "",
  line_items: [],
  notes: "",
  repair_description: "",
  design_brief: "",
  metal_type: "",
  stone_details: "",
  estimated_turnaround: "",
  staff_member: "",
};

function validate(data: QuoteFormData): Partial<Record<keyof QuoteFormData, string>> {
  const errors: Partial<Record<keyof QuoteFormData, string>> = {};
  if (!data.quote_type) errors.quote_type = "Select a quote type";
  if (!data.customer_first_name.trim()) errors.customer_first_name = "Required";
  if (!data.customer_last_name.trim()) errors.customer_last_name = "Required";
  if (!data.item_description.trim()) errors.item_description = "Required";
  if (!data.staff_member) errors.staff_member = "Required";
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
  const [formData, setFormData] = useState<QuoteFormData>({ ...DEFAULT_FORM_DATA });
  const [errors, setErrors] = useState<Partial<Record<keyof QuoteFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formData }),
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
    setFormData({ ...DEFAULT_FORM_DATA });
    setErrors({});
    setSubmittedQuote(null);
    setSubmitting(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submittedQuote) {
    return <QuoteSuccessScreen quote={submittedQuote} onNew={handleNew} />;
  }

  const total = formData.line_items.reduce((s, li) => s + (li.price || 0), 0);
  const customerName = [formData.customer_first_name, formData.customer_last_name]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <NavBar />

      <main className="max-w-5xl mx-auto px-4 py-6 pb-32">
        <div className="lg:flex lg:gap-6">
          {/* Form column */}
          <div className="flex-1 min-w-0 space-y-4">
            <Card title="Step 1 — Quote Type">
              <QuoteTypeSelector value={formData.quote_type} onChange={handleTypeChange} />
              {errors.quote_type && (
                <p className="mt-2 text-xs text-red-600">{errors.quote_type}</p>
              )}
            </Card>

            {formData.quote_type && (
              <>
                <Card title="Customer & Staff">
                  <QuoteCustomerSection
                    data={formData}
                    onChange={handleChange}
                    errors={errors}
                  />
                </Card>

                <Card title="Item Description">
                  <div>
                    <label className="block text-sm font-semibold text-black mb-1">
                      Item Description<span className="text-black ml-0.5">*</span>
                    </label>
                    <textarea
                      value={formData.item_description}
                      onChange={(e) => handleChange("item_description", e.target.value)}
                      rows={3}
                      placeholder="Describe the item(s)…"
                      className={`w-full rounded-lg border px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black ${
                        errors.item_description
                          ? "border-red-500 bg-red-50"
                          : "border-gray-300 bg-white"
                      }`}
                    />
                    {errors.item_description && (
                      <p className="mt-1 text-xs text-red-600">{errors.item_description}</p>
                    )}
                  </div>
                </Card>

                <Card title="Line Items">
                  <QuoteLineItems
                    lineItems={formData.line_items}
                    onChange={handleLineItemsChange}
                  />
                </Card>

                <Card title="Notes">
                  <textarea
                    value={formData.notes}
                    onChange={(e) => handleChange("notes", e.target.value)}
                    rows={2}
                    placeholder="Any additional notes for the customer…"
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black"
                  />
                </Card>

                {formData.quote_type === "repair" && (
                  <Card title="Repair Details">
                    <QuoteRepairFields data={formData} onChange={handleChange} />
                  </Card>
                )}

                {formData.quote_type === "custom_order" && (
                  <Card title="Custom Order Details">
                    <QuoteCustomOrderFields data={formData} onChange={handleChange} />
                  </Card>
                )}
              </>
            )}
          </div>

          {/* Summary preview */}
          {formData.quote_type && (
            <div className="hidden lg:block w-72 flex-shrink-0">
              <div className="sticky top-20">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">
                  Quote Summary
                </p>
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-3">
                  <div>
                    <div className="text-xs text-gray-400 uppercase font-semibold mb-0.5">
                      Customer
                    </div>
                    <div className="text-sm font-semibold text-black">
                      {customerName || "—"}
                    </div>
                    {formData.customer_email && (
                      <div className="text-xs text-gray-500">{formData.customer_email}</div>
                    )}
                    {formData.customer_phone && (
                      <div className="text-xs text-gray-500">{formData.customer_phone}</div>
                    )}
                  </div>

                  {formData.line_items.length > 0 && (
                    <div>
                      <div className="text-xs text-gray-400 uppercase font-semibold mb-1">
                        Line Items
                      </div>
                      <div className="space-y-1">
                        {formData.line_items.map((li, i) => (
                          <div key={i} className="flex justify-between text-xs text-gray-700">
                            <span className="truncate mr-2">{li.description || "—"}</span>
                            <span className="flex-shrink-0">{formatCurrency(li.price)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 pt-2 border-t border-gray-200 flex justify-between font-semibold text-sm text-black">
                        <span>Total</span>
                        <span>{formatCurrency(total)}</span>
                      </div>
                    </div>
                  )}

                  {formData.estimated_turnaround && (
                    <div>
                      <div className="text-xs text-gray-400 uppercase font-semibold mb-0.5">
                        Turnaround
                      </div>
                      <div className="text-sm text-black">{formData.estimated_turnaround}</div>
                    </div>
                  )}

                  {formData.staff_member && (
                    <div>
                      <div className="text-xs text-gray-400 uppercase font-semibold mb-0.5">
                        Staff
                      </div>
                      <div className="text-sm text-black">{formData.staff_member}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Fixed submit bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 shadow-lg px-4 py-3">
        <div className="max-w-5xl mx-auto">
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
