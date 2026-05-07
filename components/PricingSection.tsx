"use client";

import { PacketFormData } from "@/lib/types";
import { computeBalance, formatCurrency } from "@/lib/formatters";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

export default function PricingSection({ data, onChange, errors }: Props) {
  const balance = computeBalance(data.total_charges, data.deposit);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
            Total Charges
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={data.total_charges}
              onChange={(e) => onChange("total_charges", e.target.value)}
              placeholder="0.00"
              className={`
                w-full rounded-lg border px-3 py-2.5 pl-7 text-sm text-[#1B1F3B]
                focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]
                ${errors.total_charges ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
              `}
            />
          </div>
          {errors.total_charges && (
            <p className="mt-1 text-xs text-red-600">{errors.total_charges}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
            Deposit
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={data.deposit}
              onChange={(e) => onChange("deposit", e.target.value)}
              placeholder="0.00"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 pl-7 text-sm text-[#1B1F3B] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          Balance (auto-calculated)
        </label>
        <div className="rounded-lg border border-[#C9A84C]/40 bg-[#fdf8ed] px-3 py-2.5 text-sm font-semibold text-[#1B1F3B]">
          {formatCurrency(balance)}
        </div>
      </div>
    </div>
  );
}
