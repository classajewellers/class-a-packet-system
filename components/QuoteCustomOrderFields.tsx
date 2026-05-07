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

const METAL_TYPES = [
  "9ct Yellow Gold",
  "9ct White Gold",
  "9ct Rose Gold",
  "18ct Yellow Gold",
  "18ct White Gold",
  "18ct Rose Gold",
  "Platinum",
  "Silver",
  "Other",
];

interface Props {
  data: QuoteFormData;
  onChange: (field: keyof QuoteFormData, value: string) => void;
}

export default function QuoteCustomOrderFields({ data, onChange }: Props) {
  const inputClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-black mb-1">Design Brief</label>
        <textarea
          value={data.design_brief}
          onChange={(e) => onChange("design_brief", e.target.value)}
          rows={3}
          placeholder="Describe the custom design…"
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

      <div>
        <label className="block text-sm font-semibold text-black mb-1">Metal Type</label>
        <select
          value={data.metal_type}
          onChange={(e) => onChange("metal_type", e.target.value)}
          className={inputClass}
        >
          <option value="">— Select —</option>
          {METAL_TYPES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Stone Details <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          value={data.stone_details}
          onChange={(e) => onChange("stone_details", e.target.value)}
          rows={2}
          placeholder="e.g. Round brilliant 0.5ct F/VS1…"
          className={inputClass}
        />
      </div>
    </div>
  );
}
