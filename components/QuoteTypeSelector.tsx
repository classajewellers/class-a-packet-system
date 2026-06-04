"use client";

import { QuoteType } from "@/lib/types";

interface Props {
  value: QuoteType | "";
  onChange: (type: QuoteType) => void;
}

const QUOTE_TYPES: { type: QuoteType; label: string; description: string }[] = [
  {
    type: "repair",
    label: "Repair Quote",
    description: "Jewellery repair, cleaning, resizing, or restoration",
  },
  {
    type: "custom_order",
    label: "Custom Order Quote",
    description: "Bespoke jewellery design and manufacture",
  },
];

export default function QuoteTypeSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {QUOTE_TYPES.map(({ type, label, description }) => {
        const selected = value === type;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onChange(type)}
            className={`rounded-xl border-2 px-5 py-4 text-left transition-all ${
              selected
                ? "border-black bg-[#635BFF] text-white"
                : "border-gray-200 bg-white text-black hover:border-gray-400"
            }`}
          >
            <div className={`font-semibold text-sm ${selected ? "text-white" : "text-black"}`}>
              {label}
            </div>
            <div className={`text-xs mt-1 ${selected ? "text-white/80" : "text-gray-500"}`}>
              {description}
            </div>
          </button>
        );
      })}
    </div>
  );
}
