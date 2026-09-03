/**
 * theme.ts — shared design tokens for the restyle.
 *
 * Direction (per the live ballpark.ing reference): a quiet, mostly-white canvas
 * with generous whitespace, confident large headings, soft floating cards, and
 * pill shapes — with black used SPARINGLY as an occasional high-contrast accent
 * (primary button, the odd dark card), never as persistent chrome.
 *
 * Type: Geist Sans (body/display) + Geist Mono (labels, data, eyebrows).
 */
import type { CSSProperties } from "react";

// ── Colour ───────────────────────────────────────────────────────────────────
export const color = {
  ink:        "#0A0A0A", // the rare high-contrast punch (primary buttons, active pill)
  paper:      "#fafafa", // app ground
  white:      "#ffffff", // cards / raised surfaces
  text:       "#0A0A0A",
  textMuted:  "#6b6b6b",
  textFaint:  "#9a9a9a",
  line:       "#ececec", // very light hairline (cards lean on shadow, not borders)
  fill:       "#f4f4f4", // subtle chip / neutral pill fill
  hover:      "#f4f4f4", // row / control hover

  // light sidebar rail — black appears only on the ACTIVE item, sparingly
  railBg:         "#ffffff",
  railText:       "#565656",
  railActive:     "#ffffff", // text colour on the active (black) pill
  railActiveBg:   "#0A0A0A", // the one place black is used in the rail
  railHover:      "#f4f4f4",
  railLine:       "#ececec",

  // status dot colours — semantic returns only as the small dot
  dotSuccess: "#16a34a",
  dotWarning: "#d97706",
  dotDanger:  "#dc2626",
  dotInfo:    "#2563eb",
  dotNeutral: "#9a9a9a",

  danger:   "#dc2626",
  dangerBg: "#fbeae8",
} as const;

// ── Type / font ──────────────────────────────────────────────────────────────
export const font = {
  sans: "var(--font-sans)",  // resolves to Geist Sans (globals.css)
  mono: "var(--font-mono)",  // resolves to Geist Mono
} as const;

export const radius = { sm: 8, md: 10, lg: 14, pill: 9999 } as const;
export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const shadow = {
  sm:   "0 1px 2px rgba(0,0,0,0.04)",
  card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.05)",
  lg:   "0 12px 32px rgba(0,0,0,0.08)",
} as const;

export const type = {
  // Big, confident, tightly-tracked headlines.
  h1:    { fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1.05, color: color.ink } as CSSProperties,
  h2:    { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1, color: color.ink } as CSSProperties,
  body:  { fontSize: 14, color: color.text } as CSSProperties,
  small: { fontSize: 13, color: color.textMuted } as CSSProperties,
  eyebrow: { fontFamily: font.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: color.textMuted } as CSSProperties,
  mono:    { fontFamily: font.mono, fontSize: 13, color: color.text } as CSSProperties,

  // KPI / stat hierarchy — the number dominates its label.
  statValue: { fontSize: 44, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, color: color.ink } as CSSProperties,
  statLabel: { fontFamily: font.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: color.textMuted } as CSSProperties,
} as const;

// ── Reusable component snippets ──────────────────────────────────────────────
export const card: CSSProperties = {
  background: color.white,
  border: `1px solid ${color.line}`,
  borderRadius: radius.lg,
  boxShadow: shadow.card,
};

export const btnPrimary: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
  borderRadius: radius.pill, fontSize: 14, fontWeight: 500,
  background: color.ink, color: color.white, border: "none", cursor: "pointer",
};

export const btn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 18px",
  borderRadius: radius.pill, fontSize: 14, fontWeight: 500,
  background: color.white, color: color.ink, border: `1px solid ${color.line}`, cursor: "pointer",
};

export const input: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 12px",
  borderRadius: radius.md, border: `1px solid ${color.line}`,
  fontSize: 14, color: color.ink, background: color.white,
};

// Neutral pill (non-status). For status use <StatusBadge/>.
export const badge: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 500,
  padding: "3px 10px", borderRadius: radius.pill, background: color.fill, color: color.ink,
};

export const th: CSSProperties = {
  textAlign: "left", fontFamily: font.mono, fontSize: 11, fontWeight: 500,
  letterSpacing: "0.04em", textTransform: "uppercase", color: color.textMuted,
  padding: "10px 12px", borderBottom: `1px solid ${color.line}`, background: color.white,
};

export const td: CSSProperties = {
  padding: "12px", fontSize: 13, color: color.ink, borderBottom: `1px solid ${color.line}`,
};

export const pageWrap: CSSProperties = { padding: "32px 32px 64px", maxWidth: 1100, margin: "0 auto" };
