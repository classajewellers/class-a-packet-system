"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

export default function ArticlesSection({ data, onChange, errors }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          Articles<span className="text-[#C9A84C] ml-0.5">*</span>
        </label>
        <textarea
          value={data.articles}
          onChange={(e) => onChange("articles", e.target.value)}
          placeholder="e.g. 9ct yellow gold ring with round brilliant diamond solitaire"
          rows={3}
          className={`
            w-full rounded-lg border px-3 py-2.5 text-sm text-[#1B1F3B] resize-none
            focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]
            ${errors.articles ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
          `}
          style={{ minHeight: 90 }}
        />
        {errors.articles && (
          <p className="mt-1 text-xs text-red-600">{errors.articles}</p>
        )}
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          Instructions<span className="text-[#C9A84C] ml-0.5">*</span>
        </label>
        <textarea
          value={data.instructions}
          onChange={(e) => onChange("instructions", e.target.value)}
          placeholder="Describe the repair work, order specifications, or special notes..."
          rows={5}
          className={`
            w-full rounded-lg border px-3 py-2.5 text-sm text-[#1B1F3B] resize-none
            focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]
            ${errors.instructions ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
          `}
          style={{ minHeight: 140 }}
        />
        {errors.instructions && (
          <p className="mt-1 text-xs text-red-600">{errors.instructions}</p>
        )}
      </div>
    </div>
  );
}
