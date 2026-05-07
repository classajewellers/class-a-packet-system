"use client";

import { PacketFormData } from "@/lib/types";

const STAFF_MEMBERS = [
  "Aisha Scott",
  "Arissa Michos",
  "Ben Mucklow",
  "Brad Mucklow",
  "Bridget Moore",
  "Charlotte Beavis",
  "Daniel Beecken",
  "David Johnson",
  "Dior Munro",
  "Donna Cordes",
  "Ivy Wood",
  "Jack Mullan",
  "Jess D'Alfonso",
  "Joseph Onorato",
  "Josh Mucklow",
  "Keeley Mucklow",
  "Leah Newton",
  "Melody Abram",
  "Monica Magshoodi",
  "Sam Mucklow",
  "Shahrzad Givi",
  "Sinziana Peters",
  "Viv Valladares",
];

const REFERRAL_SOURCES = [
  { value: "instagram", label: "Instagram" },
  { value: "facebook", label: "Facebook" },
  { value: "website", label: "Website" },
  { value: "word_of_mouth", label: "Word of Mouth" },
  { value: "walk_in", label: "Walk-in" },
  { value: "existing_customer", label: "Existing Customer" },
  { value: "other", label: "Other" },
];

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

export default function ReferralStaffSection({ data, onChange, errors }: Props) {
  const selectClass =
    "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            How did you find us?
          </label>
          <select
            value={data.referral_source}
            onChange={(e) => onChange("referral_source", e.target.value)}
            className={selectClass}
          >
            <option value="">— Select —</option>
            {REFERRAL_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            Occasion
          </label>
          <input
            type="text"
            value={data.occasion}
            onChange={(e) => onChange("occasion", e.target.value)}
            placeholder="e.g. Birthday, Engagement"
            className={selectClass}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Staff Member<span className="text-black ml-0.5">*</span>
        </label>
        <select
          value={data.staff_member}
          onChange={(e) => onChange("staff_member", e.target.value)}
          className={`
            w-full rounded-lg border px-3 py-2.5 text-sm text-black
            focus:outline-none focus:ring-2 focus:ring-black focus:border-black
            ${errors.staff_member ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"}
          `}
        >
          <option value="">— Select —</option>
          {STAFF_MEMBERS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {errors.staff_member && (
          <p className="mt-1 text-xs text-red-600">{errors.staff_member}</p>
        )}
      </div>
    </div>
  );
}
