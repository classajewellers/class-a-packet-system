"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
  repairTrackerNumber?: string; // set after submission
}

export default function RepairFields({ data, onChange, repairTrackerNumber }: Props) {
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
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#1B1F3B] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
        />
      </div>

      {repairTrackerNumber && (
        <div>
          <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
            Repair Tracker Number (auto-generated)
          </label>
          <div className="rounded-lg border border-[#C9A84C]/40 bg-[#fdf8ed] px-3 py-2.5 text-sm font-mono font-semibold text-[#1B1F3B]">
            {repairTrackerNumber}
          </div>
        </div>
      )}
    </div>
  );
}
