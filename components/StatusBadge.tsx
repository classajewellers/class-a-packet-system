import { color, radius } from "@/lib/theme";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const DOT: Record<StatusTone, string> = {
  success: color.dotSuccess,
  warning: color.dotWarning,
  danger:  color.dotDanger,
  info:    color.dotInfo,
  neutral: color.dotNeutral,
};

/**
 * StatusBadge — a small coloured dot + label inside a neutral pill.
 * Status reads by the dot colour, not a solid block. Use across order status,
 * stock status, etc.
 */
export default function StatusBadge({
  tone = "neutral",
  label,
  style,
}: {
  tone?: StatusTone;
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        padding: "3px 10px 3px 8px", borderRadius: radius.pill,
        background: color.fill, color: color.text,
        fontSize: 12, fontWeight: 500, whiteSpace: "nowrap",
        ...style,
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: DOT[tone], flexShrink: 0 }} />
      {label}
    </span>
  );
}
