"use client";

import { PacketFormData } from "@/lib/types";

interface Props {
  data: PacketFormData;
  onChange: (field: keyof PacketFormData, value: boolean | string[]) => void;
  errors: Partial<Record<keyof PacketFormData, string>>;
}

const CONTACT_OPTIONS = [
  { value: "text", label: "Text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
];

export default function ValueContactSection({ data, onChange, errors }: Props) {
  function toggleContact(option: string) {
    const current = data.contact_preference;
    const updated = current.includes(option)
      ? current.filter((c) => c !== option)
      : [...current, option];
    onChange("contact_preference", updated);
  }

  return (
    <div className="space-y-4">
      {/* Certificate Required */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">
          Certificate Required?
        </label>
        <div className="flex gap-3">
          {[true, false].map((val) => (
            <button
              key={String(val)}
              type="button"
              onClick={() => onChange("valuation_required", val)}
              className={`
                flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all
                ${
                  data.valuation_required === val
                    ? "border-black bg-[#635BFF] text-white"
                    : "border-gray-300 bg-white text-black hover:border-black"
                }
              `}
            >
              {val ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>

      {/* Contact preference */}
      <div>
        <label className="block text-sm font-semibold text-black mb-2">
          Contact Preference<span className="text-black ml-0.5">*</span>
        </label>
        <div className="flex gap-3">
          {CONTACT_OPTIONS.map((opt) => {
            const selected = data.contact_preference.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleContact(opt.value)}
                className={`
                  flex-1 rounded-lg border-2 py-2.5 text-sm font-semibold transition-all
                  ${
                    selected
                      ? "border-black bg-[#635BFF] text-white"
                      : "border-gray-300 bg-white text-black hover:border-black"
                  }
                `}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {errors.contact_preference && (
          <p className="mt-1 text-xs text-red-600">{errors.contact_preference}</p>
        )}
      </div>
    </div>
  );
}
