"use client";

import { QuoteFormData } from "@/lib/types";

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

interface Props {
  data: QuoteFormData;
  onChange: (field: keyof QuoteFormData, value: string) => void;
  errors: Partial<Record<keyof QuoteFormData, string>>;
}

export default function QuoteCustomerSection({ data, onChange, errors }: Props) {
  const inputClass = (field: keyof QuoteFormData) =>
    `w-full rounded-lg border px-3 py-2.5 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black ${
      errors[field] ? "border-red-500 bg-red-50" : "border-gray-300 bg-white"
    }`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            First Name<span className="text-black ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={data.customer_first_name}
            onChange={(e) => onChange("customer_first_name", e.target.value)}
            className={inputClass("customer_first_name")}
            placeholder="Jane"
          />
          {errors.customer_first_name && (
            <p className="mt-1 text-xs text-red-600">{errors.customer_first_name}</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-semibold text-black mb-1">
            Last Name<span className="text-black ml-0.5">*</span>
          </label>
          <input
            type="text"
            value={data.customer_last_name}
            onChange={(e) => onChange("customer_last_name", e.target.value)}
            className={inputClass("customer_last_name")}
            placeholder="Smith"
          />
          {errors.customer_last_name && (
            <p className="mt-1 text-xs text-red-600">{errors.customer_last_name}</p>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">Email</label>
        <input
          type="email"
          value={data.customer_email}
          onChange={(e) => onChange("customer_email", e.target.value)}
          className={inputClass("customer_email")}
          placeholder="jane@example.com"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">Phone</label>
        <input
          type="tel"
          value={data.customer_phone}
          onChange={(e) => onChange("customer_phone", e.target.value)}
          className={inputClass("customer_phone")}
          placeholder="0400 000 000"
        />
      </div>

      <div>
        <label className="block text-sm font-semibold text-black mb-1">
          Staff Member<span className="text-black ml-0.5">*</span>
        </label>
        <select
          value={data.staff_member}
          onChange={(e) => onChange("staff_member", e.target.value)}
          className={inputClass("staff_member")}
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
