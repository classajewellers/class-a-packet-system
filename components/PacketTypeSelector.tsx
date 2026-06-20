"use client";

import { PacketType } from "@/lib/types";

interface Props {
  value: PacketType | "";
  onChange: (type: PacketType) => void;
}

const TYPES: { value: PacketType; label: string; sub: string; icon: React.ReactNode }[] = [
  {
    value: "repair",
    label: "Repair Job",
    sub: "Jewellery repair & service",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
      </svg>
    ),
  },
  {
    value: "custom_order",
    label: "Custom Order",
    sub: "Bespoke jewellery creation",
    icon: (
      <svg width="28" height="28" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
      </svg>
    ),
  },
];

export default function PacketTypeSelector({ value, onChange }: Props) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      {TYPES.map((t) => {
        const selected = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            onClick={() => onChange(t.value)}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 10, padding: "28px 20px",
              background: selected ? "#EEF2FF" : "#fff",
              border: `2px solid ${selected ? "#635BFF" : "#E8E8F0"}`,
              borderRadius: 12,
              cursor: "pointer",
              transition: "border-color .15s, background .15s",
              minHeight: 140,
            }}
            onMouseEnter={e => { if (!selected) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#635BFF"; (e.currentTarget as HTMLButtonElement).style.background = "#F5F4FF"; } }}
            onMouseLeave={e => { if (!selected) { (e.currentTarget as HTMLButtonElement).style.borderColor = "#E8E8F0"; (e.currentTarget as HTMLButtonElement).style.background = "#fff"; } }}
          >
            <span style={{ color: selected ? "#635BFF" : "#6B7280" }}>{t.icon}</span>
            <span style={{ fontWeight: 600, fontSize: 15, color: selected ? "#635BFF" : "#1A1A2E", letterSpacing: "-0.01em" }}>{t.label}</span>
            <span style={{ fontSize: 12, color: selected ? "#635BFF" : "#9CA3AF", textAlign: "center", lineHeight: 1.4 }}>{t.sub}</span>
            {selected && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: "#635BFF" }}>
                <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Selected
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
