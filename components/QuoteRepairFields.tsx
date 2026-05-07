"use client";

import { QuoteFormData } from "@/lib/types";

const TURNAROUND_OPTIONS = [
  "1 week",
  "2 weeks",
  "3 weeks",
  "4 weeks",
  "6 weeks",
  "8 weeks",
  "Custom",
];

interface Props {
  data: QuoteFormData;
  onChange: (field: keyof QuoteFormData, value: string) => void;
}

export default function QuoteRepairFields({ data, onChange }: Props) {
  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Repair Description
        </label>
        <textarea
          value={data.repair_description}
          onChange={(e) => onChange("repair_description", e.target.value)}
          rows={3}
          placeholder="Describe the repair work required…"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Estimated Turnaround
        </label>
        <select
          value={data.estimated_turnaround}
          onChange={(e) => onChange("estimated_turnaround", e.target.value)}
          className={inputClass}
        >
          <option value="">— Select —</option>
          {TURNAROUND_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
