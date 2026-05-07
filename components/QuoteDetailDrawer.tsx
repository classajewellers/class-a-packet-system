"use client";

import { useRouter } from "next/navigation";
import { Quote } from "@/lib/types";
import { generateQuoteHTML } from "@/lib/quoteGenerator";

interface Props {
  quote: Quote;
  onClose: () => void;
}

function Field({ label, value }: { label: string; value?: string | null | number }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs text-gray-400 uppercase tracking-wide font-semibold">{label}</dt>
      <dd className="text-sm text-black mt-0.5">{String(value)}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3 border-b border-gray-100 pb-1">
        {title}
      </p>
      {children}
    </div>
  );
}

export default function QuoteDetailDrawer({ quote, onClose }: Props) {
  const router = useRouter();

  const customerName = [quote.customer_first_name, quote.customer_last_name]
    .filter(Boolean)
    .join(" ");

  const quoteTypeLabel =
    quote.quote_type === "repair" ? "Repair Quote" : "Custom Order Quote";

  const lineItems = quote.line_items ?? [];

  function handleReprintQuote() {
    const html = generateQuoteHTML(quote);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
  }

  function handleConvert() {
    router.push(`/?from_quote=${quote.id}`);
  }

  const statusBadge =
    quote.status === "converted"
      ? "bg-blue-100 text-blue-800"
      : "bg-gray-100 text-gray-600";

  const createdAt = new Date(quote.created_at).toLocaleString("en-AU");

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-md bg-white shadow-2xl overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <div>
            <p className="text-xs text-gray-500">{quoteTypeLabel}</p>
            <h2 className="font-mono text-base font-bold text-black">
              {quote.reference_number}
            </h2>
            <span
              className={`inline-block mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge}`}
            >
              {quote.status}
              {quote.status === "converted" && quote.packet_reference
                ? ` → ${quote.packet_reference}`
                : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 hover:bg-gray-100 transition-colors"
          >
            <svg
              className="w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Actions */}
          <button
            onClick={handleReprintQuote}
            className="w-full flex items-center justify-center gap-2 bg-black text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#222222] active:scale-[0.98] transition-all"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z"
              />
            </svg>
            Reprint Quote
          </button>

          {quote.status === "pending" && (
            <button
              onClick={handleConvert}
              className="w-full flex items-center justify-center gap-2 bg-[#A3B2A4] text-white text-sm font-semibold py-3 rounded-xl hover:bg-[#8fa290] active:scale-[0.98] transition-all"
            >
              Convert to Packet
            </button>
          )}

          {/* Customer */}
          <Section title="Customer">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Name" value={customerName} />
              <Field label="Phone" value={quote.customer_phone} />
              <Field label="Email" value={quote.customer_email} />
            </dl>
          </Section>

          {/* Quote Details */}
          <Section title="Quote Details">
            <dl className="space-y-3">
              <Field label="Item Description" value={quote.item_description} />
              <Field label="Estimated Turnaround" value={quote.estimated_turnaround} />
              <Field label="Notes" value={quote.notes} />
            </dl>
          </Section>

          {/* Line Items */}
          <Section title="Line Items">
            {lineItems.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No line items</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase w-5">#</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase">Item</th>
                    <th className="pb-2 text-left text-xs font-semibold text-gray-500 uppercase">Stone</th>
                    <th className="pb-2 text-right text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lineItems.map((li, i) => (
                    <tr key={i}>
                      <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                      <td className="py-2 text-black pr-2">{li.item}</td>
                      <td className="py-2 text-gray-600 pr-2">{li.stone}</td>
                      <td className="py-2 text-right text-black font-medium whitespace-nowrap">{li.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          {/* Repair-specific */}
          {quote.quote_type === "repair" && quote.repair_description && (
            <Section title="Repair Details">
              <Field label="Repair Description" value={quote.repair_description} />
            </Section>
          )}

          {/* Custom Order-specific */}
          {quote.quote_type === "custom_order" && (
            <Section title="Custom Order Details">
              <dl className="space-y-3">
                <Field label="Design Brief" value={quote.design_brief} />
                <Field label="Metal Type" value={quote.metal_type} />
                <Field label="Stone Details" value={quote.stone_details} />
              </dl>
            </Section>
          )}

          {/* Staff & Created */}
          <Section title="Staff & Created">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Field label="Staff Member" value={quote.staff_member} />
              <Field label="Created At" value={createdAt} />
              {quote.converted_at && (
                <Field
                  label="Converted At"
                  value={new Date(quote.converted_at).toLocaleString("en-AU")}
                />
              )}
            </dl>
          </Section>
        </div>
      </div>
    </div>
  );
}
