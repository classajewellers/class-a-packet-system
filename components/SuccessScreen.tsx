"use client";

import { Packet, SubmissionResults } from "@/lib/types";
import { formatDateAU } from "@/lib/formatters";

interface Props {
  packet: Packet;
  results: SubmissionResults;
  onPrintAgain: () => void;
  onNewPacket: () => void;
  onRetry: (output: "klaviyo" | "email" | "sms" | "sheets" | "label") => void;
}

const OUTPUT_LABELS: Array<{
  key: keyof Omit<SubmissionResults, "supabase">;
  label: string;
}> = [
  { key: "label", label: "Label" },
  { key: "klaviyo", label: "Klaviyo" },
  { key: "email", label: "Email" },
  { key: "sms", label: "SMS" },
  { key: "sheets", label: "Sheets" },
];

export default function SuccessScreen({
  packet,
  results,
  onPrintAgain,
  onNewPacket,
  onRetry,
}: Props) {
  const hasFailures = OUTPUT_LABELS.some((o) => results[o.key] === "failed");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white fade-in overflow-y-auto py-8">
      <div className="w-full max-w-md mx-4">
        {/* Success tick */}
        <div className="flex justify-center mb-6">
          <div className="h-20 w-20 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path className="tick-path" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div className="text-center mb-6">
          <p className="text-sm font-medium text-gray-500 uppercase tracking-widest mb-1">
            Packet Created
          </p>
          <h1 className="text-4xl font-bold text-black mb-2 font-mono tracking-wider">
            {packet.reference_number}
          </h1>
          {packet.due_date && (
            <p className="text-lg font-semibold text-black">
              Due {formatDateAU(packet.due_date)}
            </p>
          )}
          <p className="text-sm text-gray-500 mt-1">
            {[packet.customer_first_name, packet.customer_last_name]
              .filter(Boolean)
              .join(" ")}
          </p>
        </div>

        {/* Output status */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Output Status
          </p>
          <div className="grid grid-cols-5 gap-2">
            {OUTPUT_LABELS.map(({ key, label }) => (
              <div key={key} className="flex flex-col items-center gap-1">
                {results[key] === "success" ? (
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : results[key] === "failed" ? (
                  <button
                    onClick={() => onRetry(key as Parameters<typeof onRetry>[0])}
                    className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center hover:bg-red-200 transition-colors"
                    title={`Retry ${label}`}
                  >
                    <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                    </svg>
                  </button>
                ) : (
                  <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <div className="h-2 w-2 rounded-full bg-gray-400" />
                  </div>
                )}
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>
          {hasFailures && (
            <p className="text-xs text-red-600 mt-3 text-center">
              Tap the red icons above to retry failed outputs.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onPrintAgain}
            className="flex-1 rounded-xl border-2 border-black bg-white py-3.5 text-sm font-semibold text-black hover:bg-gray-50 transition-colors"
          >
            Print Another Label
          </button>
          <button
            onClick={onNewPacket}
            className="flex-1 rounded-xl bg-black py-3.5 text-sm font-semibold text-white hover:bg-[#222222] transition-colors"
          >
            New Packet
          </button>
        </div>
      </div>
    </div>
  );
}
