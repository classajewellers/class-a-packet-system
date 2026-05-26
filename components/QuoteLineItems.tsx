"use client";

import { LineItem } from "@/lib/types";
import { calculateRetailPrice, calculateMultiplier, multiplierColour } from "@/lib/marginCalculator";

interface Props {
  lineItems: LineItem[];
  onChange: (lineItems: LineItem[]) => void;
  /** When true, the Cost Price column and margin indicators are visible. */
  isManager: boolean;
}

const EMPTY_ITEM: LineItem = { design: "", stone: "", price: "", cost_price: "" };

const MARGIN_COLOURS = {
  green:  { bg: "#DCFCE7", text: "#15803D" },
  orange: { bg: "#FEF9C3", text: "#B45309" },
  red:    { bg: "#FEE2E2", text: "#DC2626" },
};

export default function QuoteLineItems({ lineItems, onChange, isManager }: Props) {
  function addItem() {
    onChange([...lineItems, { ...EMPTY_ITEM }]);
  }

  function removeItem(index: number) {
    if (lineItems.length <= 1) return;
    onChange(lineItems.filter((_, i) => i !== index));
  }

  function updateItem(index: number, field: keyof LineItem, value: string) {
    const updated = lineItems.map((li, i) => {
      if (i !== index) return li;
      const next = { ...li, [field]: value };

      // When cost_price changes, auto-calculate retail price
      if (field === "cost_price") {
        const cost = parseFloat(value.replace(/[^0-9.]/g, ""));
        if (!isNaN(cost) && cost > 0) {
          const retail = calculateRetailPrice(cost);
          next.price = `$${retail.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        // If cost is cleared, leave retail as-is (don't wipe manual entries)
      }

      return next;
    });
    onChange(updated);
  }

  const inputClass =
    "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black focus:border-black w-full";

  // Grid: Design | Stone | Retail Price | [Cost Price — mgr only] | Remove
  const gridCols = isManager
    ? "grid-cols-[3fr_2fr_1fr_1fr_32px]"
    : "grid-cols-[3fr_2fr_1fr_32px]";

  return (
    <div className="space-y-3">
      {/* Column headers */}
      <div className={`grid ${gridCols} gap-2 px-0.5 mb-1`}>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Design</p>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Stone</p>
        <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Retail Price</p>
        {isManager && (
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#635BFF" }}>
            Cost Price
          </p>
        )}
        <span />
      </div>

      {lineItems.map((li, i) => {
        // Multiplier calculation for managers
        const retailNum = parseFloat((li.price ?? "").replace(/[^0-9.]/g, ""));
        const costNum   = parseFloat((li.cost_price ?? "").replace(/[^0-9.]/g, ""));
        const mult = isManager && !isNaN(retailNum) && !isNaN(costNum)
          ? calculateMultiplier(retailNum, costNum)
          : null;
        const colour = mult != null ? multiplierColour(mult) : null;
        const colourStyle = colour ? MARGIN_COLOURS[colour] : null;

        return (
          <div key={i} className="space-y-1">
            <div className={`grid ${gridCols} gap-2 items-center`}>
              {/* Design */}
              <input
                type="text"
                value={li.design}
                onChange={(e) => updateItem(i, "design", e.target.value)}
                placeholder="e.g. Diamond solitaire ring"
                className={inputClass}
              />
              {/* Stone */}
              <input
                type="text"
                value={li.stone}
                onChange={(e) => updateItem(i, "stone", e.target.value)}
                placeholder="Stone (optional)"
                className={inputClass}
              />
              {/* Retail Price */}
              <input
                type="text"
                value={li.price}
                onChange={(e) => updateItem(i, "price", e.target.value)}
                placeholder="$450 / POA"
                className={inputClass}
              />
              {/* Cost Price — manager/admin only */}
              {isManager && (
                <input
                  type="text"
                  value={li.cost_price ?? ""}
                  onChange={(e) => updateItem(i, "cost_price", e.target.value)}
                  placeholder="Our cost"
                  className={inputClass}
                  style={{ borderColor: "#C4BFFE" }}
                />
              )}
              {/* Remove */}
              <button
                type="button"
                onClick={() => removeItem(i)}
                disabled={lineItems.length <= 1}
                className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-red-50 text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors font-bold text-lg leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                title="Remove row"
              >
                &times;
              </button>
            </div>

            {/* Multiplier indicator — manager only, shown when both retail & cost are present */}
            {isManager && mult != null && colourStyle && (
              <div className={`grid ${gridCols} gap-2`}>
                {/* Skip Design, Stone columns */}
                <span />
                <span />
                {/* Spans the Retail + Cost columns */}
                <div
                  className="col-span-2 flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium"
                  style={{ background: colourStyle.bg, color: colourStyle.text }}
                >
                  <span>×{mult.toFixed(2)}</span>
                  <span style={{ opacity: 0.6 }}>
                    (${(retailNum - costNum).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} profit)
                  </span>
                </div>
                <span />
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addItem}
        className="text-sm font-semibold text-black border border-gray-300 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
      >
        + Add Row
      </button>
    </div>
  );
}
