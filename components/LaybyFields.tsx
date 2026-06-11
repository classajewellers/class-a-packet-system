"use client";

import { PacketFormData } from "@/lib/types";
import { computeBalance } from "@/lib/formatters";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string | boolean) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

const SCHEDULES = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
];

export default function LaybyFields({ data, onChange, errors }: Props) {
  const balance = computeBalance(data.total_charges, data.deposit);
  const numPayments = parseInt(data.number_of_payments) || 0;
  const paymentAmount = numPayments > 0 ? balance / numPayments : 0;

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-2">
          Layby Schedule<span className="text-[#C9A84C] ml-0.5">*</span>
        </label>
        <div className="flex gap-3">
          {SCHEDULES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => onChange("layby_schedule", s.value)}
              className={`
                flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all
                ${
                  data.layby_schedule === s.value
                    ? "border-[#C9A84C] bg-[#1B1F3B] text-white"
                    : "border-gray-300 bg-white text-[#1B1F3B] hover:border-[#C9A84C]"
                }
              `}
            >
              {s.label}
            </button>
          ))}
        </div>
        {errors.layby_schedule && (
          <p className="mt-1 text-xs text-red-600">{errors.layby_schedule}</p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
            Number of Payments<span className="text-[#C9A84C] ml-0.5">*</span>
          </label>
          <input
            type="number"
            min="1"
            step="1"
            value={data.number_of_payments}
            onChange={(e) => onChange("number_of_payments", e.target.value)}
            placeholder="e.g. 4"
            className={`
              w-full rounded-lg border px-3 py-2.5 text-sm text-[#1B1F3B]
              focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]
              ${errors.number_of_payments ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
            `}
          />
          {errors.number_of_payments && (
            <p className="mt-1 text-xs text-red-600">{errors.number_of_payments}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
            Payment Amount (auto-calculated)
          </label>
          <div className="rounded-lg border border-[#C9A84C]/40 bg-[#fdf8ed] px-3 py-2.5 text-sm font-semibold text-[#1B1F3B]">
            {numPayments > 0
              ? `$${paymentAmount.toFixed(2)}`
              : "—"}
          </div>
        </div>
      </div>

      <div>
        <div
          className={`
            rounded-xl border-2 p-4 transition-all
            ${data.terms_accepted ? "border-[#C9A84C] bg-[#fdf8ed]" : "border-gray-300 bg-white"}
          `}
        >
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => onChange("terms_accepted", !data.terms_accepted)}
              className={`
                mt-0.5 h-6 w-6 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all
                ${data.terms_accepted ? "border-[#C9A84C] bg-[#C9A84C]" : "border-gray-400 bg-white"}
              `}
            >
              {data.terms_accepted && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div>
              <p className="text-sm font-semibold text-[#1B1F3B]">
                Terms Accepted<span className="text-[#C9A84C] ml-0.5">*</span>
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                Customer agrees to Vault layby terms. No article can be picked up without this receipt.
              </p>
            </div>
          </div>
        </div>
        {errors.terms_accepted && (
          <p className="mt-1 text-xs text-red-600">{errors.terms_accepted}</p>
        )}
      </div>
    </div>
  );
}
