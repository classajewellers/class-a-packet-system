"use client";

import { SubmissionResults } from "@/lib/types";

interface Props {
  results: SubmissionResults;
}

const ROWS: { key: keyof SubmissionResults; label: string }[] = [
  { key: "supabase", label: "Saving record" },
  { key: "label", label: "Printing label" },
  { key: "klaviyo", label: "Updating Klaviyo" },
  { key: "email", label: "Sending confirmation email" },
  { key: "sms", label: "Sending SMS" },
  { key: "sheets", label: "Logging to Sheets" },
];

function StatusIcon({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <svg className="w-5 h-5 text-gray-400 spinner" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    );
  }
  if (status === "success") {
    return (
      <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === "failed") {
    return (
      <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return null;
}

export default function SubmissionOverlay({ results }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 fade-in">
      <div className="w-full max-w-sm mx-4 rounded-2xl bg-white shadow-2xl p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="h-10 w-10 rounded-full bg-[#A3B2A4] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-bold text-black">Submitting Packet</h2>
            <p className="text-xs text-gray-500">Please wait…</p>
          </div>
        </div>

        <div className="space-y-3">
          {ROWS.map(({ key, label }) => {
            const status = results[key] ?? "pending";
            return (
              <div key={key} className="flex items-center gap-3">
                <StatusIcon status={status} />
                <span
                  className={`text-sm ${
                    status === "failed"
                      ? "text-red-600 font-medium"
                      : status === "success"
                      ? "text-green-700"
                      : "text-gray-700"
                  }`}
                >
                  {label}
                  {status === "pending" ? "…" : ""}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
