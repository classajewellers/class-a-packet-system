"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
}

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#1B1F3B] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]";

const selectClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#1B1F3B] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]";

export default function CustomOrderFields({ data, onChange }: Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          From Date
        </label>
        <input
          type="date"
          value={data.from_date}
          onChange={(e) => onChange("from_date", e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          Metal Carat
        </label>
        <select
          value={data.metal_colour}
          onChange={(e) => onChange("metal_colour", e.target.value)}
          className={selectClass}
        >
          <option value="">— Select —</option>
          <option>9ct</option>
          <option>18ct</option>
          <option>Platinum</option>
          <option>Sterling Silver</option>
        </select>
      </div>
    </div>
  );
}
