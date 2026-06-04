"use client";

import { useRouter } from "next/navigation";
import { Quote } from "@/lib/types";
import QuoteDocument from "./QuoteDocument";

interface Props {
  quote: Quote;
  onNew: () => void;
}

export default function QuotePreviewScreen({ quote, onNew }: Props) {
  const router = useRouter();

  const customerName =
    [quote.customer_first_name, quote.customer_last_name]
      .filter(Boolean)
      .join(" ") || "—";

  function handleConvert() {
    router.push(`/?from_quote=${quote.id}`);
  }

  function handleDownloadPDF() {
    window.print();
  }

  return (
    <>
      {/*
       * Print isolation: make everything invisible, then reveal only
       * #quote-doc and its children via position:fixed at the page origin.
       * @page margin provides the physical margins on paper.
       */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #quote-doc,
          #quote-doc * { visibility: visible !important; }
          #quote-doc {
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          @page { size: A4 portrait; margin: 15mm; }
        }
      `}</style>

      <div className="min-h-screen bg-gray-100 flex">

        {/* ── Left panel ── */}
        <div className="w-72 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col px-6 py-6 sticky top-0 h-screen overflow-y-auto print:hidden">

          {/* Back link */}
          <a
            href="/admin?tab=quotes"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-black transition-colors mb-8"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            Back to Quotes
          </a>

          {/* Success badge */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-[#635BFF] flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>
            <div>
              <p className="font-bold text-black text-sm">Quote Generated</p>
              <p className="text-xs text-gray-400">Saved successfully</p>
            </div>
          </div>

          {/* Reference number */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 mb-5">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">
              Reference
            </p>
            <p className="font-mono text-xl font-bold text-black">{quote.reference_number}</p>
          </div>

          {/* Customer */}
          <div className="mb-6">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">
              Customer
            </p>
            <p className="text-sm font-semibold text-black">{customerName}</p>
          </div>

          {/* Staff */}
          {quote.staff_member && (
            <div className="mb-6">
              <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">
                Staff Member
              </p>
              <p className="text-sm text-black">{quote.staff_member}</p>
            </div>
          )}

          {/* Actions — push to bottom */}
          <div className="mt-auto space-y-3">
            <button
              onClick={handleDownloadPDF}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-black text-white py-3 text-sm font-semibold hover:bg-[#222222] active:scale-[0.99] transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download PDF
            </button>

            {quote.status === "pending" && (
              <button
                onClick={handleConvert}
                className="w-full rounded-xl bg-[#635BFF] text-white py-3 text-sm font-semibold hover:bg-[#4F46E5] active:scale-[0.99] transition-all"
              >
                Convert to Order
              </button>
            )}

            <button
              onClick={onNew}
              className="w-full rounded-xl border-2 border-black text-black py-3 text-sm font-semibold hover:bg-gray-50 active:scale-[0.99] transition-all"
            >
              New Quote
            </button>
          </div>
        </div>

        {/* ── Right panel — A4 preview ── */}
        <div className="flex-1 overflow-y-auto p-8">

          {/* Toolbar above the document */}
          <div className="max-w-[794px] mx-auto mb-4 flex items-center justify-between print:hidden">
            <p className="text-sm font-medium text-gray-500">Quote Preview</p>
            <button
              onClick={handleDownloadPDF}
              className="flex items-center gap-2 rounded-lg bg-[#1d4ed8] text-white px-4 py-2 text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.056 48.056 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              Save as PDF
            </button>
          </div>

          {/*
           * A4 document card.
           * id="quote-doc" is the print isolation target.
           * On screen: white card with shadow, 794px wide, 1123px tall (A4 px).
           * On print: position:fixed, full viewport, shadow removed.
           */}
          <div
            id="quote-doc"
            className="max-w-[794px] mx-auto bg-white shadow-2xl"
            style={{ minHeight: "1123px" }}
          >
            <QuoteDocument quote={quote} />
          </div>

          {/* Bottom breathing room */}
          <div className="h-12 print:hidden" />
        </div>
      </div>
    </>
  );
}
