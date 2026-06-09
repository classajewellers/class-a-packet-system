"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: string | string[] | boolean) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

const BUDGET_RANGES = [
  "Under $500",
  "$500–$1,000",
  "$1,000–$2,500",
  "$2,500–$5,000",
  "$5,000–$10,000",
  "$10,000+",
];

const JEWELLERY_INTERESTS = [
  "Rings",
  "Earrings",
  "Necklaces",
  "Bracelets",
  "Watches",
  "Custom design",
  "Repairs",
];

export default function ClientIntakeFields({ data, onChange }: Props) {
  function toggleInterest(interest: string) {
    const current = data.jewellery_interests;
    const updated = current.includes(interest)
      ? current.filter((i) => i !== interest)
      : [...current, interest];
    onChange("jewellery_interests", updated);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-1">
          Budget Range
        </label>
        <select
          value={data.budget_range}
          onChange={(e) => onChange("budget_range", e.target.value)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-[#1B1F3B] focus:outline-none focus:ring-2 focus:ring-[#C9A84C] focus:border-[#C9A84C]"
        >
          <option value="">— Select —</option>
          {BUDGET_RANGES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-semibold text-[#1B1F3B] mb-2">
          Jewellery Interests
        </label>
        <div className="flex flex-wrap gap-2">
          {JEWELLERY_INTERESTS.map((interest) => {
            const selected = data.jewellery_interests.includes(interest);
            return (
              <button
                key={interest}
                type="button"
                onClick={() => toggleInterest(interest)}
                className={`
                  rounded-full border-2 px-4 py-1.5 text-sm font-semibold transition-all
                  ${
                    selected
                      ? "border-[#C9A84C] bg-[#1B1F3B] text-white"
                      : "border-gray-300 bg-white text-[#1B1F3B] hover:border-[#C9A84C]"
                  }
                `}
              >
                {interest}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div
          className={`
            rounded-xl border-2 p-4 transition-all
            ${data.consent_to_marketing ? "border-[#C9A84C] bg-[#fdf8ed]" : "border-gray-300 bg-white"}
          `}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onChange("consent_to_marketing", !data.consent_to_marketing)}
              className={`
                h-6 w-6 flex-shrink-0 rounded border-2 flex items-center justify-center transition-all
                ${data.consent_to_marketing ? "border-[#C9A84C] bg-[#C9A84C]" : "border-gray-400 bg-white"}
              `}
            >
              {data.consent_to_marketing && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <div>
              <p className="text-sm font-semibold text-[#1B1F3B]">Consent to Marketing</p>
              <p className="text-xs text-gray-600">
                Customer agrees to receive marketing communications from Vault.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
