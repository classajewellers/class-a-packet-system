"use client";

import { useRouter } from "next/navigation";
import { Quote } from "@/lib/types";
import { generateQuoteHTML } from "@/lib/quoteGenerator";

interface Props {
  quote: Quote;
  onNew: () => void;
}

export default function QuoteSuccessScreen({ quote, onNew }: Props) {
  const router = useRouter();

  function handleOpenQuote() {
    const html = generateQuoteHTML(quote);
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
  }

  function handleConvert() {
    router.push(`/?from_quote=${quote.id}`);
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center px-4">
      {/* Success icon */}
      <div className="w-20 h-20 rounded-full bg-[#A3B2A4] flex items-center justify-center mb-6">
        <svg
          className="w-10 h-10 text-white"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <h1 className="text-2xl font-bold text-black mb-2">Quote Generated!</h1>
      <p className="text-sm text-gray-500 mb-6">Your quote has been saved successfully.</p>

      {/* Reference number */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-8 py-4 mb-8 text-center">
        <p className="text-xs text-gray-400 uppercase tracking-widest font-semibold mb-1">
          Quote Reference
        </p>
        <p className="font-mono text-2xl font-bold text-black">{quote.reference_number}</p>
      </div>

      {/* Actions */}
      <div className="w-full max-w-xs space-y-3">
        <button
          type="button"
          onClick={handleOpenQuote}
          className="w-full rounded-xl bg-black text-white py-3.5 font-semibold text-sm hover:bg-[#222222] active:scale-[0.99] transition-all"
        >
          Open Quote / Save PDF
        </button>

        {quote.status === "pending" && (
          <button
            type="button"
            onClick={handleConvert}
            className="w-full rounded-xl bg-[#A3B2A4] text-white py-3.5 font-semibold text-sm hover:bg-[#8fa290] active:scale-[0.99] transition-all"
          >
            Convert to Order
          </button>
        )}

        <button
          type="button"
          onClick={onNew}
          className="w-full rounded-xl border-2 border-black text-black py-3.5 font-semibold text-sm hover:bg-gray-50 active:scale-[0.99] transition-all"
        >
          New Quote
        </button>
      </div>
    </div>
  );
}
