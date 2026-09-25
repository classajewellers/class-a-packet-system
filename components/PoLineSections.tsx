"use client";

import { useState, type ReactNode } from "react";

export function isCastingCategory(name: string | null | undefined): boolean {
  return (name ?? "").trim().toLowerCase().includes("casting");
}

const GRID: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: "10px 16px",
};

function headingStyle(): React.CSSProperties {
  return {
    fontSize: 11,
    fontWeight: 700,
    color: "#6B7280",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    margin: "4px 0 8px",
  };
}

export function PoLineSections({
  categoryName,
  stonesHaveValues,
  what,
  metal,
  stones,
  cost,
  notes,
}: {
  categoryName: string | null;
  stonesHaveValues: boolean;
  what: ReactNode;
  metal: ReactNode;
  stones: ReactNode;
  cost: ReactNode;
  notes: ReactNode;
}) {
  const casting = isCastingCategory(categoryName);
  const [stonesOpen, setStonesOpen] = useState(!casting);
  const [wasCasting, setWasCasting] = useState(casting);
  if (wasCasting !== casting) {
    setWasCasting(casting);
    setStonesOpen(!casting);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <section>
        <div style={headingStyle()}>What it is</div>
        <div style={GRID}>{what}</div>
      </section>
      <section>
        <div style={headingStyle()}>Metal</div>
        <div style={GRID}>{metal}</div>
      </section>
      <section>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ ...headingStyle(), margin: 0 }}>Stones</div>
          {casting && (
            <button
              type="button"
              onClick={() => setStonesOpen((open) => !open)}
              aria-expanded={stonesOpen}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                fontSize: 12,
                fontWeight: 600,
                color: "#4F46E5",
                cursor: "pointer",
              }}
            >
              {stonesOpen ? "Hide" : stonesHaveValues ? "Show stones (saved)" : "Show stones"}
            </button>
          )}
        </div>
        {casting && !stonesOpen && (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: "#9CA3AF" }}>
            Hidden for castings. Open this if the casting includes stones.
          </p>
        )}
        {(!casting || stonesOpen) && (
          <div style={{ ...GRID, marginTop: 8 }}>{stones}</div>
        )}
      </section>
      <section>
        <div style={headingStyle()}>Cost & Xero</div>
        <div style={GRID}>{cost}</div>
      </section>
      <section>
        <div style={headingStyle()}>Notes</div>
        {notes}
      </section>
    </div>
  );
}
