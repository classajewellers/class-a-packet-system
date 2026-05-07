"use client";

import { PacketType } from "@/lib/types";

interface Props {
  value: PacketType | "";
  onChange: (type: PacketType) => void;
}

const STANDARD_TYPES: { value: PacketType; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    value: "repair",
    label: "Repair Job",
    sub: "Jewellery repair & service",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    value: "custom_order",
    label: "Custom Order",
    sub: "Bespoke jewellery creation",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
  {
    value: "layby",
    label: "Layby",
    sub: "Instalment payment plan",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zm6.75-4.5h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V15zm0 2.25h.008v.008h-.008v-.008zm2.25-4.5h.008v.008H16.5v-.008zm0 2.25h.008v.008H16.5V15z" />
      </svg>
    ),
  },
  {
    value: "client_intake",
    label: "Client Intake",
    sub: "New customer profile",
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
];

export default function PacketTypeSelector({ value, onChange }: Props) {
  const onlineSelected = value === "online_order";

  return (
    <div className="space-y-3">
      {/* Online Order — full-width top card */}
      <button
        type="button"
        onClick={() => onChange("online_order")}
        className={`
          w-full flex items-center justify-center gap-3 rounded-xl border-2 p-4 text-center
          transition-all duration-150 min-h-[64px]
          ${
            onlineSelected
              ? "border-black bg-black text-white shadow-lg"
              : "border-black bg-black text-white opacity-80 hover:opacity-100"
          }
        `}
      >
        <svg className="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5V6a3.75 3.75 0 10-7.5 0v4.5m11.356-1.993l1.263 12c.07.665-.45 1.243-1.119 1.243H4.25a1.125 1.125 0 01-1.12-1.243l1.264-12A1.125 1.125 0 015.513 7.5h12.974c.576 0 1.059.435 1.119 1.007zM8.625 10.5a.375.375 0 11-.75 0 .375.375 0 01.75 0zm7.5 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <span className="font-bold text-base tracking-widest uppercase">Online Order</span>
        {onlineSelected && (
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Standard 4 types — 2×2 grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STANDARD_TYPES.map((t) => {
          const selected = value === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onChange(t.value)}
              className={`
                flex flex-col items-center justify-center gap-2 rounded-xl border-2 p-4 text-center
                transition-all duration-150 min-h-[120px]
                ${
                  selected
                    ? "border-black bg-[#A3B2A4] text-white shadow-lg scale-[1.02]"
                    : "border-gray-300 bg-white text-black hover:border-black hover:bg-gray-50"
                }
              `}
            >
              <span className={selected ? "text-white" : "text-black"}>
                {t.icon}
              </span>
              <span className="font-semibold text-sm leading-tight">{t.label}</span>
              <span
                className={`text-xs leading-tight ${
                  selected ? "text-white/80" : "text-gray-500"
                }`}
              >
                {t.sub}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
