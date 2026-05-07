"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
}

export default function CustomOrderFields({ data, onChange }: Props) {
  return (
    <div>
      <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
        From Date
      </label>
      <input
        type="date"
        value={data.from_date}
        onChange={(e) => onChange("from_date", e.target.value)}
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#1B1F3B] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
      />
    </div>
  );
}
