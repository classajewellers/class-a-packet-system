/**
 * theme.ts — shared design tokens for the minimal high-contrast (black/white)
 * restyle. Import these instead of hardcoding hex/spacing so the whole app's
 * look is driven from one place. Migrated screen-by-screen (see the phased
 * restyle plan); anything referencing these tokens restyles centrally.
 *
 * Palette: #0A0A0A (near-black ink) on #fafafa (near-white ground).
 * Type: Geist Sans (body/display) + Geist Mono (labels, data, eyebrows) —
 * the free, OFL-licensed substitute for the reference's proprietary Antarctica.
 */
import type { CSSProperties } from "react";

// ── Colour ───────────────────────────────────────────────────────────────────
export const color = {
  ink:        "#0A0A0A", // primary text / accent (near-black)
  paper:      "#fafafa", // app ground (near-white)
  white:      "#ffffff", // cards / raised surfaces
  text:       "#0A0A0A",
  textMuted:  "#6b6b6b", // secondary text
  textFaint:  "#9a9a9a", // tertiary / placeholder / meta
  line:       "#e4e4e4", // hairline borders
  lineStrong: "#0A0A0A", // emphasis border (active / underline)
  fill:       "#f4f4f4", // subtle chip / fill
  hover:      "#f2f2f2", // row / control hover

  // inverted surface (the dark sidebar rail)
  railBg:       "#0A0A0A",
  railText:     "#8a8a8a",
  railActive:   "#ffffff",
  railActiveBg: "rgba(255,255,255,0.10)",
  railHover:    "rgba(255,255,255,0.06)",
  railLine:     "rgba(255,255,255,0.10)",

  // semantic — kept minimal; one functional colour for destructive/error
  danger:   "#c0362c",
  dangerBg: "#fbeae8",
} as const;

// ── Type / font ──────────────────────────────────────────────────────────────
export const font = {
  sans: "var(--font-geist-sans), system-ui, -apple-system, sans-serif",
  mono: "var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace",
} as const;

export const radius = { sm: 4, md: 6, lg: 8, pill: 999 } as const;
export const space  = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const type = {
  h1:    { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: color.ink } as CSSProperties,
  h2:    { fontSize: 18, fontWeight: 600, letterSpacing: "-0.01em", color: color.ink } as CSSProperties,
  body:  { fontSize: 14, color: color.text } as CSSProperties,
  small: { fontSize: 13, color: color.textMuted } as CSSProperties,
  // technical accent — Geist Mono, uppercase, tracked (the Antarctica substitute)
  eyebrow: { fontFamily: font.mono, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: color.textMuted } as CSSProperties,
  mono:    { fontFamily: font.mono, fontSize: 13, color: color.text } as CSSProperties,
} as const;

// ── Reusable component snippets ──────────────────────────────────────────────
export const card: CSSProperties = {
  background: color.white, border: `1px solid ${color.line}`, borderRadius: radius.lg,
};

export const btnPrimary: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px",
  borderRadius: radius.md, fontSize: 14, fontWeight: 500,
  background: color.ink, color: color.white, border: "none", cursor: "pointer",
};

export const btn: CSSProperties = {
  display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 16px",
  borderRadius: radius.md, fontSize: 14, fontWeight: 500,
  background: color.white, color: color.ink, border: `1px solid ${color.line}`, cursor: "pointer",
};

export const input: CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "9px 12px",
  borderRadius: radius.md, border: `1px solid ${color.line}`,
  fontSize: 14, color: color.ink, background: color.white,
};

export const badge: CSSProperties = {
  display: "inline-flex", alignItems: "center", fontSize: 11, fontWeight: 500,
  padding: "2px 8px", borderRadius: radius.pill, background: color.fill, color: color.ink,
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
