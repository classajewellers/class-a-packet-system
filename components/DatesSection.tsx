"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

export default function DatesSection({ data, onChange, errors }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          In Date
        </label>
        <input
          type="date"
          value={data.in_date}
          onChange={(e) => onChange("in_date", e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#1B1F3B] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          Due Date<span className="text-[#C9A84C] ml-0.5">*</span>
        </label>
        <input
          type="date"
          value={data.due_date}
          onChange={(e) => onChange("due_date", e.target.value)}
          className={`
            w-full rounded-lg border px-3 py-2.5 text-sm text-[#1B1F3B]
            focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]
            ${errors.due_date ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
          `}
        />
        {errors.due_date && (
          <p className="mt-1 text-xs text-red-600">{errors.due_date}</p>
        )}
      </div>
    </div>
  );
}
